import { randomBytes } from "node:crypto";
import { one, q } from "@/db/client";

/**
 * Custom domains: the company adds its domain → we show DNS records → we check them → the SSL
 * provider issues a certificate → the domain can become the primary address of the site.
 *
 * Ownership is proven with a TXT record (_site-verify.<host> = token). Until then the hostname is
 * not served, so nobody can attach somebody else's domain to their site.
 *
 * DNS is read over DNS-over-HTTPS (DNS_DOH_URL, default Cloudflare) so results do not depend on the
 * server's own resolver cache. SSL is handled by DOMAIN_PROVIDER:
 *   vercel      Vercel project domains API (VERCEL_TOKEN, VERCEL_PROJECT_ID, optional VERCEL_TEAM_ID)
 *   cloudflare  Cloudflare for SaaS custom hostnames (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID)
 *   caddy       Caddy on-demand TLS on your own server: Caddy asks /api/domains/allowed before issuing
 *   manual      certificates are handled outside the platform (default)
 */

export type DomainRow = {
  hostname: string; site_id: string; is_primary: boolean; ssl_status: "pending" | "provisioning" | "active" | "failed";
  kind: "staging" | "custom"; verify_token: string | null; verified_at: string | null; dns_ok: boolean;
  provider_ref: string | null; last_check_at: string | null; last_error: string | null; created_at: string;
};
type Fail = { ok: false; error: string };

export const VERIFY_PREFIX = process.env.DOMAIN_VERIFY_PREFIX ?? "_site-verify";
export const cnameTarget = () => process.env.PLATFORM_CNAME_TARGET ?? "sites.yourplatform.com";
export const apexIps = () => (process.env.PLATFORM_A_RECORDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
export const provider = () => (process.env.DOMAIN_PROVIDER ?? "manual") as "vercel" | "cloudflare" | "caddy" | "manual";
const platformDomain = () => (process.env.PLATFORM_DOMAIN ?? "localhost").toLowerCase();

/** "https://WWW.Example.com/about" → "www.example.com"; null if it is not a usable hostname. */
export function normalizeHost(input: string): string | null {
  let h = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.$/, "");
  if (h.length > 253 || !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)) return null;
  if (h.startsWith("xn--") || h.includes(".xn--")) return h; // punycode is fine
  return h;
}
/** Apex = exactly one label before a public suffix we can recognise simply (good enough for US business domains). */
export function isApex(host: string) {
  const parts = host.split(".");
  const twoPartTld = /\.(co|com|org|net|gov|edu|ac)\.[a-z]{2}$/.test(host);
  return parts.length === (twoPartTld ? 3 : 2);
}

export async function listDomains(siteId: string) {
  return q<DomainRow>("SELECT * FROM domains WHERE site_id = $1 ORDER BY is_primary DESC, kind, hostname", [siteId]);
}

/** Primary served hostname for a site, only when it is verified and has a certificate. */
export async function primaryHost(siteId: string) {
  const r = await one<{ hostname: string }>("SELECT hostname FROM domains WHERE site_id = $1 AND is_primary AND verified_at IS NOT NULL AND ssl_status = 'active'", [siteId]);
  return r?.hostname ?? null;
}

export async function addDomain(siteId: string, input: string): Promise<{ ok: true; hostname: string } | Fail> {
  const host = normalizeHost(input);
  if (!host) return { ok: false, error: "Enter a domain like www.example.com." };
  const pd = platformDomain();
  if (host === pd || host.endsWith(`.${pd}`)) return { ok: false, error: `Addresses on ${pd} are assigned by the platform.` };
  const existing = await one<{ site_id: string }>("SELECT site_id FROM domains WHERE hostname = $1", [host]);
  if (existing) return { ok: false, error: existing.site_id === siteId ? "This domain is already added." : "This domain is connected to another site. Contact support if it is yours." };
  const n = await one<{ n: number }>("SELECT count(*)::int AS n FROM domains WHERE site_id = $1 AND kind = 'custom'", [siteId]);
  if ((n?.n ?? 0) >= 10) return { ok: false, error: "A site can have up to 10 domains." };
  await q("INSERT INTO domains (hostname, site_id, is_primary, kind, verify_token) VALUES ($1,$2,false,'custom',$3)", [host, siteId, randomBytes(16).toString("hex")]);
  return { ok: true, hostname: host };
}

// ---------- DNS over HTTPS

type DnsAnswer = { name: string; type: number; data: string };
async function doh(name: string, type: "TXT" | "CNAME" | "A"): Promise<string[]> {
  const url = new URL(process.env.DNS_DOH_URL ?? "https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", name);
  url.searchParams.set("type", type);
  const res = await fetch(url, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`DNS lookup failed (${res.status})`);
  const body = (await res.json()) as { Answer?: DnsAnswer[] };
  const code = { TXT: 16, CNAME: 5, A: 1 }[type];
  return (body.Answer ?? []).filter((a) => a.type === code).map((a) => a.data.replace(/^"|"$/g, "").replace(/"\s*"/g, "").replace(/\.$/, "").toLowerCase());
}

export type DnsCheck = { ownership: boolean; pointing: boolean; found: { txt: string[]; cname: string[]; a: string[] } };
export async function checkDns(d: Pick<DomainRow, "hostname" | "verify_token">): Promise<DnsCheck> {
  const [txt, cname, a] = await Promise.all([doh(`${VERIFY_PREFIX}.${d.hostname}`, "TXT"), doh(d.hostname, "CNAME"), doh(d.hostname, "A")]);
  const target = cnameTarget().toLowerCase();
  const ips = apexIps();
  return {
    ownership: !!d.verify_token && txt.includes(d.verify_token.toLowerCase()),
    pointing: cname.includes(target) || (ips.length > 0 && a.length > 0 && a.every((x) => ips.includes(x))),
    found: { txt, cname, a },
  };
}

// ---------- SSL providers

type ProviderResult = { status: DomainRow["ssl_status"]; ref?: string; message?: string };

async function api(url: string, init: RequestInit & { token: string }) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${init.token}`, "content-type": "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: body as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const vercel = () => {
  const base = (process.env.VERCEL_API_URL ?? "https://api.vercel.com").replace(/\/+$/, "");
  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
  return { base, team, token: process.env.VERCEL_TOKEN ?? "", project: process.env.VERCEL_PROJECT_ID ?? "" };
};
const cloudflare = () => ({
  base: (process.env.CLOUDFLARE_API_URL ?? "https://api.cloudflare.com/client/v4").replace(/\/+$/, ""),
  token: process.env.CLOUDFLARE_API_TOKEN ?? "", zone: process.env.CLOUDFLARE_ZONE_ID ?? "",
});

async function providerAdd(host: string): Promise<ProviderResult> {
  switch (provider()) {
    case "vercel": {
      const v = vercel();
      const r = await api(`${v.base}/v10/projects/${v.project}/domains${v.team}`, { method: "POST", token: v.token, body: JSON.stringify({ name: host }) });
      if (!r.ok && r.body?.error?.code !== "domain_already_in_use_by_project" && r.status !== 409) return { status: "failed", message: r.body?.error?.message ?? `Vercel ${r.status}` };
      return { status: "provisioning", ref: host };
    }
    case "cloudflare": {
      const c = cloudflare();
      const r = await api(`${c.base}/zones/${c.zone}/custom_hostnames`, { method: "POST", token: c.token, body: JSON.stringify({ hostname: host, ssl: { method: "http", type: "dv" } }) });
      if (!r.ok) return { status: "failed", message: r.body?.errors?.[0]?.message ?? `Cloudflare ${r.status}` };
      return { status: "provisioning", ref: r.body?.result?.id };
    }
    default:
      // caddy issues on the first HTTPS request (after asking /api/domains/allowed); manual = handled elsewhere.
      return { status: "active" };
  }
}

async function providerStatus(d: DomainRow): Promise<ProviderResult> {
  switch (provider()) {
    case "vercel": {
      const v = vercel();
      const r = await api(`${v.base}/v9/projects/${v.project}/domains/${d.hostname}${v.team}`, { method: "GET", token: v.token });
      if (!r.ok) return { status: "failed", message: r.body?.error?.message ?? `Vercel ${r.status}` };
      if (!r.body.verified) return { status: "provisioning", message: "Vercel is still verifying the domain." };
      const cfg = await api(`${v.base}/v6/domains/${d.hostname}/config${v.team}`, { method: "GET", token: v.token });
      return cfg.ok && cfg.body.misconfigured === false ? { status: "active" } : { status: "provisioning", message: "Waiting for DNS to reach Vercel." };
    }
    case "cloudflare": {
      const c = cloudflare();
      const r = await api(`${c.base}/zones/${c.zone}/custom_hostnames/${d.provider_ref}`, { method: "GET", token: c.token });
      if (!r.ok) return { status: "failed", message: r.body?.errors?.[0]?.message ?? `Cloudflare ${r.status}` };
      const ssl = r.body?.result?.ssl?.status;
      return ssl === "active" ? { status: "active" } : { status: "provisioning", message: `Certificate: ${ssl ?? "pending"}` };
    }
    default:
      return { status: "active" };
  }
}

async function providerRemove(d: DomainRow) {
  try {
    if (provider() === "vercel") {
      const v = vercel();
      await api(`${v.base}/v9/projects/${v.project}/domains/${d.hostname}${v.team}`, { method: "DELETE", token: v.token });
    } else if (provider() === "cloudflare" && d.provider_ref) {
      const c = cloudflare();
      await api(`${c.base}/zones/${c.zone}/custom_hostnames/${d.provider_ref}`, { method: "DELETE", token: c.token });
    }
  } catch { /* the row goes anyway; a leftover entry at the provider is harmless */ }
}

// ---------- the check that moves a domain forward

/** Re-checks DNS and SSL for one domain and records the result. Safe to call repeatedly (button and cron). */
export async function refreshDomain(siteId: string, hostname: string): Promise<DomainRow | null> {
  const d = await one<DomainRow>("SELECT * FROM domains WHERE site_id = $1 AND hostname = $2", [siteId, hostname]);
  if (!d || d.kind !== "custom") return d ?? null;
  let error: string | null = null;
  try {
    const dns = await checkDns(d);
    const verified = d.verified_at || dns.ownership;
    if (!verified) error = `TXT record ${VERIFY_PREFIX}.${d.hostname} not found yet${dns.found.txt.length ? ` (found: ${dns.found.txt.join(", ").slice(0, 120)})` : ""}.`;
    else if (!dns.pointing) error = `The domain does not point to the platform yet${dns.found.cname.length ? ` (CNAME is ${dns.found.cname[0]})` : dns.found.a.length ? ` (A record is ${dns.found.a.join(", ")})` : ""}.`;
    await q("UPDATE domains SET verified_at = COALESCE(verified_at, CASE WHEN $1 THEN now() END), dns_ok = $2 WHERE hostname = $3",
      [!!verified, dns.pointing, d.hostname]);
    if (verified && dns.pointing) {
      const p = d.ssl_status === "pending" || d.ssl_status === "failed" ? await providerAdd(d.hostname) : await providerStatus(d);
      error = p.message ?? null;
      await q("UPDATE domains SET ssl_status = $1, provider_ref = COALESCE($2, provider_ref) WHERE hostname = $3", [p.status, p.ref ?? null, d.hostname]);
      if (p.status === "provisioning" && d.ssl_status === "pending") {
        const again = await providerStatus({ ...d, provider_ref: p.ref ?? d.provider_ref });
        await q("UPDATE domains SET ssl_status = $1 WHERE hostname = $2", [again.status, d.hostname]);
        error = again.message ?? null;
      }
    }
  } catch (e) {
    error = `Check failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  await q("UPDATE domains SET last_check_at = now(), last_error = $1 WHERE hostname = $2", [error, d.hostname]);
  return (await one<DomainRow>("SELECT * FROM domains WHERE hostname = $1", [d.hostname])) ?? null;
}

/** Cron: move every unfinished domain along (DNS can take hours to spread). */
export async function refreshPendingDomains() {
  const rows = await q<{ site_id: string; hostname: string }>(
    `SELECT site_id, hostname FROM domains WHERE kind = 'custom' AND (verified_at IS NULL OR NOT dns_ok OR ssl_status <> 'active')
       AND created_at > now() - interval '14 days' AND (last_check_at IS NULL OR last_check_at < now() - interval '4 minutes') ORDER BY last_check_at NULLS FIRST LIMIT 20`);
  for (const r of rows) await refreshDomain(r.site_id, r.hostname);
  return rows.length;
}

/**
 * Makes a ready domain the site's main address: canonical URLs, sitemap and structured data use it,
 * and every other address of the site redirects to it.
 */
export async function setPrimary(siteId: string, hostname: string): Promise<{ ok: true } | Fail> {
  const d = await one<DomainRow>("SELECT * FROM domains WHERE site_id = $1 AND hostname = $2", [siteId, hostname]);
  if (!d) return { ok: false, error: "Domain not found." };
  if (d.kind !== "custom" || !d.verified_at || !d.dns_ok || d.ssl_status !== "active") return { ok: false, error: "Finish the DNS setup first; the domain must show as Ready." };
  await q("UPDATE domains SET is_primary = (hostname = $2) WHERE site_id = $1", [siteId, hostname]);
  await q("UPDATE sites SET company = jsonb_set(company, '{siteUrl}', $1::jsonb), updated_at = now() WHERE id = $2", [JSON.stringify(`https://${hostname}`), siteId]);
  return { ok: true };
}

export async function removeDomain(siteId: string, hostname: string): Promise<{ ok: true } | Fail> {
  const d = await one<DomainRow>("SELECT * FROM domains WHERE site_id = $1 AND hostname = $2", [siteId, hostname]);
  if (!d) return { ok: false, error: "Domain not found." };
  if (d.kind !== "custom") return { ok: false, error: "The platform address cannot be removed." };
  if (d.is_primary) return { ok: false, error: "Make another domain primary before removing this one." };
  await providerRemove(d);
  await q("DELETE FROM domains WHERE hostname = $1", [hostname]);
  return { ok: true };
}

/** For Caddy on-demand TLS: may a certificate be issued for this hostname? */
export async function certificateAllowed(hostname: string) {
  const h = normalizeHost(hostname);
  if (!h) return false;
  return !!(await one("SELECT 1 FROM domains WHERE hostname = $1 AND verified_at IS NOT NULL", [h]));
}
