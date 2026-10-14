import { getPublishedSite, siteIdFromHostParam } from "@/lib/site-runtime";
import { sitemapXml } from "@/lib/sitemap";
import { one } from "@/db/client";

export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const siteId = await siteIdFromHostParam((await params).host);
  const live = siteId ? await getPublishedSite(siteId) : null;
  if (!siteId || !live) return new Response("Not found", { status: 404 });
  const v = await one<{ created_at: string }>("SELECT created_at FROM site_versions WHERE id = $1", [live.versionId]);
  const lastmod = new Date(v?.created_at ?? Date.now()).toISOString().slice(0, 10);
  return new Response(sitemapXml(live.site, lastmod), { headers: { "content-type": "application/xml; charset=utf-8" } });
}
