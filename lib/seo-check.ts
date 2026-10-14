import { cookies } from "next/headers";
import { parse } from "node-html-parser";
import { json, one, q } from "@/db/client";
import { auditSite, crawl } from "@/lib/audit-core.mjs";

/**
 * Runs the SEO / accessibility rules on the DRAFT, by crawling the editor preview of the site
 * (exactly what will go live), and stores the report. Findings point at the page and, where
 * possible, the block to fix.
 */
export type Finding = { level: "error" | "warning"; message: string; path: string; block?: string; edit?: string };
export type SeoReport = { errors: number; warnings: number; pages: number; images: number; links: number; findings: Finding[]; checkedAt: string };

// Where the server can reach itself. On Vercel there is no local server, so use the deployment's own address.
const origin = () =>
  process.env.INTERNAL_ORIGIN ??
  (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://127.0.0.1:${process.env.PORT ?? 3000}`);

export async function runSeoCheck(siteId: string): Promise<SeoReport> {
  const sid = (await cookies()).get("sid")?.value ?? "";
  const base = `${origin()}/preview/${encodeURIComponent(siteId)}`;
  const fetchPath = async (path: string, { method }: { method: string }) => {
    // Pages are fetched through the draft preview; shared images and uploads are platform-wide files.
    const url = /^\/(images|media)\//.test(path) ? origin() + path : base + (path === "/" ? "" : path);
    const r = await fetch(url, { method, headers: { cookie: `sid=${sid}` }, redirect: "manual", cache: "no-store" });
    return { status: r.status, contentType: r.headers.get("content-type"), text: () => r.text() };
  };
  const pages = await crawl(fetchPath, (h: string) => parse(h));
  const summary = auditSite(pages, ""); // the draft has no sitemap yet; the live sitemap is generated from the same data

  const editLinks = await editLinkResolver(siteId);
  const findings: Finding[] = [
    ...pages.flatMap((p: { path: string; findings: { level: "error" | "warning"; message: string; block?: string }[] }) =>
      p.findings.map((f) => ({ ...f, path: p.path, edit: editLinks(p.path, f.block) }))),
    ...summary.siteFindings.map((f: { level: "error" | "warning"; message: string; path?: string }) => ({ ...f, path: f.path ?? "/", edit: editLinks(f.path ?? "/") })),
  ];
  const report: SeoReport = {
    errors: findings.filter((f) => f.level === "error").length,
    warnings: findings.filter((f) => f.level === "warning").length,
    pages: summary.pages,
    images: summary.images,
    links: summary.links,
    findings,
    checkedAt: new Date().toISOString(),
  };
  await q("INSERT INTO seo_reports (site_id, errors, warnings, pages, report) VALUES ($1,$2,$3,$4,$5)", [siteId, report.errors, report.warnings, report.pages, json(report)]);
  await q("DELETE FROM seo_reports WHERE site_id = $1 AND id NOT IN (SELECT id FROM seo_reports WHERE site_id = $1 ORDER BY id DESC LIMIT 20)", [siteId]);
  return report;
}

export async function latestSeoReport(siteId: string) {
  const r = await one<{ report: SeoReport; created_at: string }>("SELECT report, created_at FROM seo_reports WHERE site_id = $1 ORDER BY id DESC LIMIT 1", [siteId]);
  const site = await one<{ updated_at: string }>("SELECT updated_at FROM sites WHERE id = $1", [siteId]);
  if (!r) return null;
  return { ...r.report, stale: !!site && new Date(site.updated_at) > new Date(r.created_at) };
}

/** Maps a site path (+ block id) to the admin screen where it is edited. */
async function editLinkResolver(siteId: string) {
  const pages = await q<{ id: number; slug: string }>("SELECT id, slug FROM pages WHERE site_id = $1", [siteId]);
  const sections = await q<{ id: number; page_id: number; block_id: string }>(
    "SELECT s.id, s.page_id, s.block_id FROM sections s JOIN pages p ON p.id = s.page_id WHERE p.site_id = $1", [siteId]);
  const base = `/admin/${siteId}`;
  return (path: string, block?: string) => {
    const page = pages.find((p) => p.slug === path);
    if (page) {
      const s = block && sections.find((x) => x.page_id === page.id && x.block_id === block);
      return `${base}/pages/${page.id}${s ? `?block=${s.id}` : ""}`;
    }
    const m = path.match(/^\/products\/([\w-]+)(?:\/([\w-]+))?$/);
    if (m?.[2]) return `${base}/products/${m[2]}`;
    if (m?.[1]) return `${base}/categories/${m[1]}`;
    return undefined;
  };
}
