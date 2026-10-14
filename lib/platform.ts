import { json, one, q } from "@/db/client";
import { siteChanged } from "@/lib/site-runtime";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Platform administration: what the operator of the platform (not a customer) sees and does.
 * Every change made here is written to platform_audit with who did it.
 */

type Fail = { ok: false; error: string };

export async function audit(actor: Pick<SessionUser, "id" | "email">, action: string, target: string, detail: Record<string, unknown> = {}) {
  await q("INSERT INTO platform_audit (actor_id, actor, action, target, detail) VALUES ($1,$2,$3,$4,$5)", [actor.id, actor.email, action, target, json(detail)]);
}

// ---------- overview

export async function overview() {
  const n = async (sql: string, p: unknown[] = []) => (await one<{ n: number }>(sql, p))?.n ?? 0;
  const [users, users30, admins, disabled] = await Promise.all([
    n("SELECT count(*)::int AS n FROM users"),
    n("SELECT count(*)::int AS n FROM users WHERE created_at > now() - interval '30 days'"),
    n("SELECT count(*)::int AS n FROM users WHERE platform_admin"),
    n("SELECT count(*)::int AS n FROM users WHERE disabled_at IS NOT NULL"),
  ]);
  const siteStatus = await q<{ status: string; n: number }>("SELECT status, count(*)::int AS n FROM sites GROUP BY status");
  const sites = Object.fromEntries(siteStatus.map((r) => [r.status, r.n])) as Record<string, number>;
  const [publishes30, inquiries30, spam30, generations30] = await Promise.all([
    n("SELECT count(*)::int AS n FROM site_versions WHERE created_at > now() - interval '30 days'"),
    n("SELECT count(*)::int AS n FROM inquiries WHERE NOT spam AND received_at > now() - interval '30 days'"),
    n("SELECT count(*)::int AS n FROM inquiries WHERE spam AND received_at > now() - interval '30 days'"),
    n("SELECT count(*)::int AS n FROM site_generations WHERE created_at > now() - interval '30 days'"),
  ]);
  const ai = (await one<{ calls: number; input: number; output: number }>(
    "SELECT count(*)::int AS calls, coalesce(sum(input_tokens),0)::int AS input, coalesce(sum(output_tokens),0)::int AS output FROM ai_jobs WHERE created_at > now() - interval '30 days' AND step NOT IN ('skeleton','products')"))!;
  const emails = Object.fromEntries((await q<{ status: string; n: number }>(
    "SELECT status, count(*)::int AS n FROM email_outbox WHERE created_at > now() - interval '30 days' GROUP BY status")).map((r) => [r.status, r.n])) as Record<string, number>;
  const domains = (await one<{ ready: number; pending: number }>(
    `SELECT count(*) FILTER (WHERE verified_at IS NOT NULL AND dns_ok AND ssl_status = 'active')::int AS ready,
            count(*) FILTER (WHERE NOT (verified_at IS NOT NULL AND dns_ok AND ssl_status = 'active'))::int AS pending
       FROM domains WHERE kind = 'custom'`))!;
  const daily = await q<{ day: string; signups: number; sites: number; inquiries: number; publishes: number }>(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day,
       (SELECT count(*)::int FROM users WHERE created_at::date = d) AS signups,
       (SELECT count(*)::int FROM sites WHERE created_at::date = d) AS sites,
       (SELECT count(*)::int FROM inquiries WHERE NOT spam AND received_at::date = d) AS inquiries,
       (SELECT count(*)::int FROM site_versions WHERE created_at::date = d) AS publishes
     FROM generate_series(current_date - 13, current_date, interval '1 day') AS g(d) ORDER BY d DESC`);
  return { users, users30, admins, disabled, sites, publishes30, inquiries30, spam30, generations30, ai, emails, domains, daily };
}

/** Things an operator should look at: anything failed or stuck. */
export async function needsAttention() {
  const [jobs, generations, emails, webhooks, domains] = await Promise.all([
    q<{ id: number; kind: string; payload: Record<string, unknown>; last_error: string | null; finished_at: string }>(
      "SELECT id, kind, payload, last_error, finished_at FROM jobs WHERE status = 'failed' AND finished_at > now() - interval '14 days' ORDER BY id DESC LIMIT 20"),
    q<{ site_id: string; status: string; error: string | null; updated_at: string }>(
      "SELECT site_id, status, error, updated_at FROM site_generations WHERE status = 'failed' OR (status = 'generating' AND updated_at < now() - interval '30 minutes') ORDER BY updated_at DESC LIMIT 20"),
    q<{ id: number; site_id: string | null; kind: string; to_addr: string; last_error: string | null; created_at: string }>(
      "SELECT id, site_id, kind, to_addr, last_error, created_at FROM email_outbox WHERE status = 'failed' AND created_at > now() - interval '7 days' ORDER BY id DESC LIMIT 20"),
    q<{ id: number; site_id: string; url: string; last_error: string | null; created_at: string }>(
      "SELECT id, site_id, url, last_error, created_at FROM webhook_deliveries WHERE status = 'failed' AND created_at > now() - interval '7 days' ORDER BY id DESC LIMIT 20"),
    q<{ hostname: string; site_id: string; last_error: string | null; created_at: string }>(
      "SELECT hostname, site_id, last_error, created_at FROM domains WHERE kind = 'custom' AND NOT (verified_at IS NOT NULL AND dns_ok AND ssl_status = 'active') AND created_at < now() - interval '24 hours' ORDER BY created_at LIMIT 20"),
  ]);
  return { jobs, generations, emails, webhooks, domains, total: jobs.length + generations.length + emails.length + webhooks.length + domains.length };
}

// ---------- sites

export type PlatformSiteRow = {
  id: string; name: string; status: string; created_at: string; owners: string | null; main: string | null; staging: string | null;
  products: number; inquiries30: number; last_publish: string | null; versions: number; tokens: number; generation: string | null;
};

export async function listAllSites(filter: { q?: string; status?: string }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.q) { params.push(`%${filter.q.toLowerCase()}%`); where.push(`(lower(s.id) LIKE $${params.length} OR lower(s.name) LIKE $${params.length} OR EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.site_id = s.id AND lower(u.email) LIKE $${params.length}) OR EXISTS (SELECT 1 FROM domains d WHERE d.site_id = s.id AND d.hostname LIKE $${params.length}))`); }
  if (filter.status) { params.push(filter.status); where.push(`s.status = $${params.length}`); }
  return q<PlatformSiteRow>(
    `SELECT s.id, s.name, s.status, s.created_at,
       (SELECT string_agg(u.email, ', ' ORDER BY u.email) FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.site_id = s.id AND m.role = 'owner') AS owners,
       (SELECT hostname FROM domains d WHERE d.site_id = s.id AND d.is_primary AND d.kind = 'custom' AND d.ssl_status = 'active' LIMIT 1) AS main,
       (SELECT hostname FROM domains d WHERE d.site_id = s.id AND d.kind = 'staging' ORDER BY hostname LIMIT 1) AS staging,
       (SELECT count(*)::int FROM products p WHERE p.site_id = s.id) AS products,
       (SELECT count(*)::int FROM inquiries i WHERE i.site_id = s.id AND NOT i.spam AND i.received_at > now() - interval '30 days') AS inquiries30,
       (SELECT max(created_at) FROM site_versions v WHERE v.site_id = s.id) AS last_publish,
       (SELECT count(*)::int FROM site_versions v WHERE v.site_id = s.id) AS versions,
       (SELECT coalesce(sum(input_tokens + output_tokens),0)::int FROM ai_jobs a WHERE a.site_id = s.id) AS tokens,
       (SELECT status FROM site_generations g WHERE g.site_id = s.id) AS generation
     FROM sites s ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY s.created_at DESC LIMIT 500`, params);
}

export async function siteDetail(siteId: string) {
  const site = await one<{ id: string; name: string; status: string; suspended_reason: string | null; created_at: string; updated_at: string; company: { legalName: string; siteUrl: string; email: string; phoneDisplay: string; address: { city: string; region: string } } }>(
    "SELECT id, name, status, suspended_reason, created_at, updated_at, company FROM sites WHERE id = $1", [siteId]);
  if (!site) return null;
  const [members, domains, versions, generation, aiByStep, emails, inquiries, counts] = await Promise.all([
    q<{ user_id: number; email: string; name: string; role: string; last_login_at: string | null; disabled: boolean }>(
      "SELECT u.id AS user_id, u.email, u.name, m.role, u.last_login_at, u.disabled_at IS NOT NULL AS disabled FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.site_id = $1 ORDER BY m.role DESC, u.email", [siteId]),
    q<{ hostname: string; kind: string; is_primary: boolean; verified_at: string | null; dns_ok: boolean; ssl_status: string; last_error: string | null }>(
      "SELECT hostname, kind, is_primary, verified_at, dns_ok, ssl_status, last_error FROM domains WHERE site_id = $1 ORDER BY is_primary DESC, kind, hostname", [siteId]),
    q<{ id: number; note: string; author: string; kind: string; created_at: string }>(
      "SELECT id, note, author, kind, created_at FROM site_versions WHERE site_id = $1 ORDER BY id DESC LIMIT 10", [siteId]),
    one<{ status: string; provider: string | null; error: string | null; created_at: string; updated_at: string; summary: { todos: unknown[]; products: { created: number } } | null }>(
      "SELECT status, provider, error, created_at, updated_at, summary FROM site_generations WHERE site_id = $1", [siteId]),
    q<{ step: string; calls: number; failed: number; input: number; output: number; model: string | null }>(
      `SELECT step, count(*)::int AS calls, count(*) FILTER (WHERE status = 'failed')::int AS failed,
              coalesce(sum(input_tokens),0)::int AS input, coalesce(sum(output_tokens),0)::int AS output, max(model) AS model
         FROM ai_jobs WHERE site_id = $1 GROUP BY step ORDER BY step`, [siteId]),
    q<{ id: number; kind: string; to_addr: string; status: string; last_error: string | null; created_at: string }>(
      "SELECT id, kind, to_addr, status, last_error, created_at FROM email_outbox WHERE site_id = $1 ORDER BY id DESC LIMIT 15", [siteId]),
    one<{ total: number; d30: number; spam: number; last: string | null }>(
      `SELECT count(*) FILTER (WHERE NOT spam)::int AS total, count(*) FILTER (WHERE NOT spam AND received_at > now() - interval '30 days')::int AS d30,
              count(*) FILTER (WHERE spam)::int AS spam, max(received_at) FILTER (WHERE NOT spam) AS last FROM inquiries WHERE site_id = $1`, [siteId]),
    one<{ pages: number; products: number; collections: number; media: number }>(
      `SELECT (SELECT count(*)::int FROM pages WHERE site_id = $1) AS pages, (SELECT count(*)::int FROM products WHERE site_id = $1) AS products,
              (SELECT count(*)::int FROM collections WHERE site_id = $1) AS collections, (SELECT count(*)::int FROM media WHERE site_id = $1) AS media`, [siteId]),
  ]);
  return { site, members, domains, versions, generation, aiByStep, emails, inquiries: inquiries!, counts: counts! };
}

export async function setSiteSuspended(actor: SessionUser, siteId: string, suspend: boolean, reason: string): Promise<{ ok: true } | Fail> {
  const s = await one<{ status: string }>("SELECT status FROM sites WHERE id = $1", [siteId]);
  if (!s) return { ok: false, error: "Site not found." };
  if (suspend) {
    if (!reason.trim()) return { ok: false, error: "Give a reason (it is recorded in the audit log)." };
    await q("UPDATE sites SET status = 'suspended', suspended_reason = $2 WHERE id = $1", [siteId, reason.trim().slice(0, 300)]);
  } else {
    const live = await one("SELECT 1 FROM site_versions WHERE site_id = $1", [siteId]);
    await q("UPDATE sites SET status = $2, suspended_reason = NULL WHERE id = $1", [siteId, live ? "live" : "draft"]);
  }
  await audit(actor, suspend ? "site.suspend" : "site.resume", siteId, suspend ? { reason: reason.trim() } : {});
  siteChanged(siteId);
  return { ok: true };
}

/** Support access: the operator joins the site's team as an owner. Visible to the customer on their Team page. */
export async function setSupportAccess(actor: SessionUser, siteId: string, join: boolean): Promise<{ ok: true } | Fail> {
  if (!(await one("SELECT 1 FROM sites WHERE id = $1", [siteId]))) return { ok: false, error: "Site not found." };
  if (join) {
    await q("INSERT INTO memberships (user_id, site_id, role) VALUES ($1,$2,'owner') ON CONFLICT (user_id, site_id) DO NOTHING", [actor.id, siteId]);
  } else {
    const owners = await one<{ n: number }>("SELECT count(*)::int AS n FROM memberships WHERE site_id = $1 AND role = 'owner' AND user_id <> $2", [siteId, actor.id]);
    if (!owners?.n) return { ok: false, error: "You are the only owner; leaving would orphan the site." };
    await q("DELETE FROM memberships WHERE site_id = $1 AND user_id = $2", [siteId, actor.id]);
  }
  await audit(actor, join ? "support.join" : "support.leave", siteId);
  return { ok: true };
}

// ---------- users

export type PlatformUserRow = { id: number; email: string; name: string; created_at: string; last_login_at: string | null; google: boolean; platform_admin: boolean; disabled_at: string | null; sites: string | null };

export async function listUsers(filter: { q?: string }) {
  const params: unknown[] = [];
  let where = "";
  if (filter.q) { params.push(`%${filter.q.toLowerCase()}%`); where = "WHERE lower(u.email) LIKE $1 OR lower(u.name) LIKE $1"; }
  return q<PlatformUserRow>(
    `SELECT u.id, u.email, u.name, u.created_at, u.last_login_at, u.google_sub IS NOT NULL AS google, u.platform_admin, u.disabled_at,
       (SELECT string_agg(m.site_id || ':' || m.role, ', ' ORDER BY m.site_id) FROM memberships m WHERE m.user_id = u.id) AS sites
     FROM users u ${where} ORDER BY u.created_at DESC LIMIT 500`, params);
}

export async function setUserDisabled(actor: SessionUser, userId: number, disable: boolean): Promise<{ ok: true } | Fail> {
  if (userId === actor.id) return { ok: false, error: "You cannot disable your own account." };
  const u = await one<{ email: string }>("SELECT email FROM users WHERE id = $1", [userId]);
  if (!u) return { ok: false, error: "User not found." };
  await q("UPDATE users SET disabled_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE id = $1", [userId, disable]);
  if (disable) await q("DELETE FROM sessions WHERE user_id = $1", [userId]); // signed out everywhere, immediately
  await audit(actor, disable ? "user.disable" : "user.enable", u.email);
  return { ok: true };
}

export async function setPlatformAdmin(actor: SessionUser, userId: number, admin: boolean): Promise<{ ok: true } | Fail> {
  if (userId === actor.id) return { ok: false, error: "Ask another platform admin to change your own access." };
  const u = await one<{ email: string; disabled: boolean }>("SELECT email, disabled_at IS NOT NULL AS disabled FROM users WHERE id = $1", [userId]);
  if (!u) return { ok: false, error: "User not found." };
  if (admin && u.disabled) return { ok: false, error: "Enable the account first." };
  await q("UPDATE users SET platform_admin = $2 WHERE id = $1", [userId, admin]);
  await audit(actor, admin ? "user.make_admin" : "user.remove_admin", u.email);
  return { ok: true };
}

export async function listAudit(limit = 200) {
  return q<{ id: number; actor: string; action: string; target: string; detail: Record<string, unknown>; created_at: string }>(
    "SELECT id, actor, action, target, detail, created_at FROM platform_audit ORDER BY id DESC LIMIT $1", [limit]);
}

// ---------- first run

/** True until the first account exists: then /admin/setup creates the first platform admin. */
export async function needsSetup() {
  return !(await one("SELECT 1 FROM users LIMIT 1"));
}
