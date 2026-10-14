// Types for lib/audit-core.mjs (plain JavaScript so the CLI runs without a build step).
import type { HTMLElement } from "node-html-parser";
export type Finding = { level: "error" | "warning"; message: string; block?: string };
export type PageAudit = { path: string; findings: Finding[]; noindex?: boolean; title?: string; description?: string; images?: number; imageSrcs: string[]; jsonLd?: number; links: { href: string; block?: string }[] };
export function auditPage(path: string, doc: HTMLElement): PageAudit;
export function auditSite(pages: PageAudit[], sitemapXml: string): { siteFindings: (Finding & { path?: string })[]; pages: number; images: number; links: number; jsonLd: number };
export function crawl(
  fetchPath: (path: string, opts: { method: string }) => Promise<{ status: number; contentType: string | null; text: () => Promise<string> }>,
  parse: (html: string) => HTMLElement,
  opts?: { maxPages?: number }
): Promise<PageAudit[]>;
