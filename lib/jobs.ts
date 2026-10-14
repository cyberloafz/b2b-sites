import { json, one, q } from "@/db/client";

/**
 * A small durable job queue in Postgres (no extra service). Jobs are claimed with
 * FOR UPDATE SKIP LOCKED, so several app servers can work the queue without doing a job twice.
 * A claimed job holds a lease; if the server dies mid-job, the lease runs out and the job is
 * picked up again (handlers must be safe to re-run — site generation rewrites the whole draft).
 *
 * Work is started right after a job is queued (Next.js after()), and the cron route
 * (/api/cron/deliver, every few minutes) picks up anything left over.
 */
export type Job = { id: number; kind: string; payload: Record<string, unknown>; attempts: number; max_attempts: number };
type Handler = (payload: Record<string, unknown>) => Promise<void>;

const LEASE_MIN = 20;
const handlers: Record<string, () => Promise<Handler>> = {
  // Imported lazily so this module stays light and free of import cycles.
  "generate-site": async () => { const { runGeneration } = await import("@/lib/ai/pipeline"); return (p) => runGeneration(String(p.siteId)); },
};

/** Adds a job kind (other modules and tests can register their own work). */
export function registerJobHandler(kind: string, fn: Handler) {
  handlers[kind] = async () => fn;
}

export async function enqueue(kind: string, payload: Record<string, unknown>, opts: { dedupe?: boolean; maxAttempts?: number } = {}) {
  if (opts.dedupe) {
    const existing = await one<{ id: number }>("SELECT id FROM jobs WHERE kind = $1 AND payload = $2::jsonb AND status IN ('queued','running')", [kind, json(payload)]);
    if (existing) return existing.id;
  }
  const r = await one<{ id: number }>("INSERT INTO jobs (kind, payload, max_attempts) VALUES ($1,$2,$3) RETURNING id", [kind, json(payload), opts.maxAttempts ?? 3]);
  return r!.id;
}

async function claim(): Promise<Job | undefined> {
  return one<Job>(
    `UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_until = now() + interval '${LEASE_MIN} minutes'
      WHERE id = (SELECT id FROM jobs
                   WHERE (status = 'queued' AND run_after <= now()) OR (status = 'running' AND locked_until < now())
                   ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id, kind, payload, attempts, max_attempts`);
}

/** Runs due jobs one after another until none are left or the time budget is used up. */
export async function runJobs(budgetMs = 240_000) {
  const start = Date.now();
  let ran = 0;
  while (Date.now() - start < budgetMs) {
    const job = await claim();
    if (!job) break;
    ran++;
    try {
      const make = handlers[job.kind];
      if (!make) throw new Error(`No handler for job kind "${job.kind}"`);
      await (await make())(job.payload);
      await q("UPDATE jobs SET status = 'done', finished_at = now(), locked_until = NULL, last_error = NULL WHERE id = $1", [job.id]);
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      const final = job.attempts >= job.max_attempts;
      await q(`UPDATE jobs SET status = $2, last_error = $3, locked_until = NULL, run_after = now() + ($4 || ' minutes')::interval, finished_at = CASE WHEN $2 = 'failed' THEN now() END WHERE id = $1`,
        [job.id, final ? "failed" : "queued", msg, String(job.attempts * 2)]);
    }
  }
  await q("DELETE FROM jobs WHERE status = 'done' AND finished_at < now() - interval '30 days'");
  return ran;
}

export async function jobFor(kind: string, payload: Record<string, unknown>) {
  return one<{ id: number; status: string; attempts: number; last_error: string | null; created_at: string; locked_until: string | null }>(
    "SELECT id, status, attempts, last_error, created_at, locked_until FROM jobs WHERE kind = $1 AND payload = $2::jsonb ORDER BY id DESC LIMIT 1", [kind, json(payload)]);
}
