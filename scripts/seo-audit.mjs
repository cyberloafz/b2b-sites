// Pre-publish SEO & accessibility check from the command line: crawls a running site from its home page.
//   node scripts/seo-audit.mjs http://localhost:3000 [--host prairie.localhost]
// --host checks another site on the same server (sent as X-Forwarded-Host, which the router reads).
// The admin runs the same rules on the draft before every publish (lib/seo-check.ts).
import { parse } from "node-html-parser";
import { auditSite, crawl } from "../lib/audit-core.mjs";

const args = process.argv.slice(2);
const hostAt = args.indexOf("--host");
const host = hostAt >= 0 ? args.splice(hostAt, 2)[1] : null;
const headers = host ? { "x-forwarded-host": host } : {};
const base = (args[0] ?? "http://localhost:3000").replace(/\/+$/, "");
const fetchPath = async (path, { method }) => {
  const r = await fetch(base + path, { method, redirect: "manual", headers });
  return { status: r.status, contentType: r.headers.get("content-type"), text: () => r.text() };
};

const pages = await crawl(fetchPath, parse);
const sitemapRes = await fetch(base + "/sitemap.xml", { headers });
const report = auditSite(pages, sitemapRes.ok ? await sitemapRes.text() : "");
const all = [
  ...pages.flatMap((p) => p.findings.map((f) => ({ ...f, path: p.path }))),
  ...report.siteFindings,
];
const errors = all.filter((f) => f.level === "error");
const warnings = all.filter((f) => f.level === "warning");

console.log(`Checked ${report.pages} pages, ${report.images} images, ${report.links} internal links, ${report.jsonLd} JSON-LD blocks.`);
for (const f of [...errors, ...warnings]) console.log(` ${f.level === "error" ? "ERROR  " : "warning"} ${f.path}${f.block ? ` [${f.block}]` : ""}: ${f.message}`);
console.log(errors.length || warnings.length ? `\n${errors.length} errors, ${warnings.length} warnings` : "All checks passed.");
process.exit(errors.length ? 1 : 0);
