import { one, q } from "@/db/client";

/** Manual redirects and the 404 log. Automatic redirects (renames, deletions) live in editor.ts. */

export type RedirectResult = { ok: true } | { ok: false; error: string };

const normal = (p: string) => {
  let s = p.trim();
  try {
    if (/^https?:\/\//.test(s)) s = new URL(s).pathname; // pasted a full URL of the same site
  } catch { /* keep as typed */ }
  s = s.split(/[?#]/)[0].replace(/\/+$/, "");
  return s.startsWith("/") ? s || "/" : "/" + s;
};

export async function addRedirect(siteId: string, fromRaw: string, toRaw: string): Promise<RedirectResult> {
  const from = normal(fromRaw), to = normal(toRaw);
  if (!/^\/[\w\-./%]*$/.test(from) || !/^\/[\w\-./%]*$/.test(to)) return { ok: false, error: "Use site paths like /old-page and /new-page." };
  if (from === "/") return { ok: false, error: "The home page cannot be redirected." };
  if (from === to) return { ok: false, error: "A page cannot redirect to itself." };
  // Follow the chain from the target; if it comes back to `from`, visitors would loop forever.
  const all = await q<{ from_path: string; to_path: string }>("SELECT from_path, to_path FROM redirects WHERE site_id = $1", [siteId]);
  const next = new Map(all.map((r) => [r.from_path, r.to_path]));
  next.set(from, to);
  const seen = new Set<string>([from]);
  let cur = to;
  while (next.has(cur)) {
    if (seen.has(cur)) return { ok: false, error: `This would create a redirect loop through ${cur}.` };
    seen.add(cur);
    cur = next.get(cur)!;
  }
  if (seen.has(cur)) return { ok: false, error: `This would create a redirect loop through ${cur}.` };
  await q(
    "INSERT INTO redirects (site_id, from_path, to_path, code) VALUES ($1,$2,$3,301) ON CONFLICT (site_id, from_path) DO UPDATE SET to_path = EXCLUDED.to_path, created_at = now()",
    [siteId, from, to]
  );
  await q("DELETE FROM not_found_log WHERE site_id = $1 AND path = $2", [siteId, from]);
  return { ok: true };
}

export async function deleteRedirect(siteId: string, from: string) {
  await q("DELETE FROM redirects WHERE site_id = $1 AND from_path = $2", [siteId, from]);
}

/** Called by the public site whenever a visitor hits a missing page. */
export async function log404(siteId: string, path: string, referrer: string | null) {
  if (path.length > 300 || /\.(php|env|git|asp|cgi)\b|wp-(admin|login)/i.test(path)) return; // ignore vulnerability scanners
  await q(
    `INSERT INTO not_found_log (site_id, path, referrer) VALUES ($1,$2,$3)
     ON CONFLICT (site_id, path) DO UPDATE SET hits = not_found_log.hits + 1, last_seen = now(), referrer = coalesce(EXCLUDED.referrer, not_found_log.referrer)`,
    [siteId, path, referrer?.slice(0, 300) ?? null]
  );
}

export async function list404(siteId: string) {
  return q<{ path: string; hits: number; referrer: string | null; last_seen: string }>(
    "SELECT path, hits, referrer, last_seen FROM not_found_log WHERE site_id = $1 ORDER BY hits DESC, last_seen DESC LIMIT 50", [siteId]);
}

export async function dismiss404(siteId: string, path: string) {
  await q("DELETE FROM not_found_log WHERE site_id = $1 AND path = $2", [siteId, path]);
}

export async function redirectCount(siteId: string) {
  return (await one<{ n: number }>("SELECT count(*)::int AS n FROM redirects WHERE site_id = $1", [siteId]))?.n ?? 0;
}
