/**
 * Job queue: a job runs once, an interrupted job (expired lease) is picked up again,
 * a failing job is retried and finally marked failed, duplicates are not queued twice.
 *   npm run test:jobs
 */
import { q, one } from "../db/client";
import { enqueue, registerJobHandler, runJobs } from "../lib/jobs";

async function main() {
  await q("DELETE FROM jobs");
  const runs: string[] = [];
  registerJobHandler("echo", async (p) => { runs.push(String(p.n)); });
  let flaky = 0;
  registerJobHandler("flaky", async () => { flaky++; throw new Error("boom"); });
  const results: [string, boolean][] = [];

  const a = await enqueue("echo", { n: 1 }, { dedupe: true });
  const b = await enqueue("echo", { n: 1 }, { dedupe: true });
  results.push(["duplicate job is not queued twice", a === b]);
  await runJobs(5000);
  results.push(["queued job runs once", runs.join(",") === "1"]);

  // Simulate a server that died mid-job: running, lease already expired.
  const c = await enqueue("echo", { n: 2 });
  await q("UPDATE jobs SET status = 'running', attempts = 1, locked_until = now() - interval '1 minute' WHERE id = $1", [c]);
  // …and one still inside its lease (another server is working on it) must be left alone.
  const d = await enqueue("echo", { n: 3 });
  await q("UPDATE jobs SET status = 'running', attempts = 1, locked_until = now() + interval '10 minutes' WHERE id = $1", [d]);
  await runJobs(5000);
  results.push(["interrupted job is picked up after its lease expires", runs.includes("2")]);
  results.push(["job with a live lease is not taken twice", !runs.includes("3")]);

  const f = await enqueue("flaky", {}, { maxAttempts: 2 });
  await runJobs(5000);
  const f1 = await one<{ status: string; attempts: number }>("SELECT status, attempts FROM jobs WHERE id = $1", [f]);
  results.push(["failed job waits before retrying", f1?.status === "queued" && f1.attempts === 1 && flaky === 1]);
  await q("UPDATE jobs SET run_after = now() WHERE id = $1", [f]);
  await runJobs(5000);
  const f2 = await one<{ status: string; last_error: string }>("SELECT status, last_error FROM jobs WHERE id = $1", [f]);
  results.push(["after max attempts the job is marked failed with its error", f2?.status === "failed" && f2.last_error === "boom" && flaky === 2]);

  for (const [n, ok] of results) console.log((ok ? "PASS " : "FAIL ") + n);
  process.exit(results.every(([, ok]) => ok) ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
