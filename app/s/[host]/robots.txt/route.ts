import { getPublishedSite, siteIdFromHostParam } from "@/lib/site-runtime";
import { robotsTxt } from "@/lib/sitemap";
import { getSiteRow } from "@/lib/repo/sites";

export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const siteId = await siteIdFromHostParam((await params).host);
  const live = siteId ? await getPublishedSite(siteId) : null;
  if (!siteId || !live) return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain" } });
  const row = await getSiteRow(siteId);
  return new Response(robotsTxt(live.site, row?.settings.allowAiCrawlers !== false), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
