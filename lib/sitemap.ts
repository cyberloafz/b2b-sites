import type { Site } from "@/schema/site";
import { canonical, collectionIndexable } from "@/lib/seo";

/** Indexable URLs only: noindex pages and thin category pages are left out automatically. */
export function sitemapXml(site: Site, lastmod: string) {
  const urls: { loc: string; priority: number }[] = [
    ...site.pages.filter((p) => !p.seo.noindex).map((p) => ({
      loc: canonical(site, p.slug),
      priority: p.slug === "/" ? 1 : p.template === "service" ? 0.9 : p.template === "legal" ? 0.2 : 0.6,
    })),
    ...site.collections.filter((c) => collectionIndexable(site, c)).map((c) => ({ loc: canonical(site, `/products/${c.slug}`), priority: 0.8 })),
    ...site.products.filter((p) => !p.seo.noindex).map((p) => ({ loc: canonical(site, `/products/${p.collection}/${p.slug}`), priority: 0.7 })),
  ];
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `<url><loc>${esc(u.loc)}</loc><lastmod>${lastmod}</lastmod><priority>${u.priority}</priority></url>`)
    .join("\n")}\n</urlset>\n`;
}

const AI_CRAWLERS = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "PerplexityBot", "Google-Extended", "CCBot"];

/** Noindex pages stay crawlable so engines can read their noindex tag. AI crawlers follow the site setting. */
export function robotsTxt(site: Site, allowAi: boolean) {
  const lines = ["User-agent: *", "Allow: /", "Disallow: /api/", ""];
  if (!allowAi) for (const ua of AI_CRAWLERS) lines.push(`User-agent: ${ua}`, "Disallow: /", "");
  lines.push(`Sitemap: ${site.company.siteUrl}/sitemap.xml`, "");
  return lines.join("\n");
}
