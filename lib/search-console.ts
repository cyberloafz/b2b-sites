import { createSign } from "node:crypto";
import { one, q } from "@/db/client";

/**
 * Submits the site's sitemap to Google Search Console after each publish.
 *
 * Setup (once per platform): create a Google Cloud service account with the Search Console API enabled
 * and put its JSON key in GSC_SERVICE_ACCOUNT_JSON. Setup (once per customer): the customer adds that
 * service account's email as a user of their Search Console property, and the property
 * (e.g. "sc-domain:example.com" or "https://www.example.com/") is saved in the site settings.
 *
 * NOTE: written against Google's documented API but not exercised in the build sandbox (no network
 * access to Google there). Every attempt is logged in sitemap_submissions.
 */
async function accessToken(): Promise<string | null> {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const key = JSON.parse(raw) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: key.client_email, scope: "https://www.googleapis.com/auth/webmasters",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(key.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function submitSitemap(siteId: string) {
  const site = await one<{ settings: { gscProperty?: string }; company: { siteUrl: string } }>("SELECT settings, company FROM sites WHERE id = $1", [siteId]);
  const property = site?.settings.gscProperty;
  const log = (status: string, detail: string) => q("INSERT INTO sitemap_submissions (site_id, status, detail) VALUES ($1,$2,$3)", [siteId, status, detail.slice(0, 300)]);
  if (!site || !property) return log("skipped", "No Search Console property in site settings");
  try {
    const token = await accessToken();
    if (!token) return log("skipped", "GSC_SERVICE_ACCOUNT_JSON is not set");
    const sitemap = `${site.company.siteUrl}/sitemap.xml`;
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/sitemaps/${encodeURIComponent(sitemap)}`;
    const res = await fetch(url, { method: "PUT", headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
    return log("submitted", sitemap);
  } catch (e) {
    return log("failed", String(e));
  }
}

export async function lastSubmission(siteId: string) {
  return one<{ status: string; detail: string; created_at: string }>("SELECT status, detail, created_at FROM sitemap_submissions WHERE site_id = $1 ORDER BY id DESC LIMIT 1", [siteId]);
}
