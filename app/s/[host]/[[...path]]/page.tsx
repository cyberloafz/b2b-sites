import { notFound, permanentRedirect, redirect } from "next/navigation";
import { findRedirect, getPublishedSite, primaryHostFor, siteIdFromHostParam } from "@/lib/site-runtime";
import { resolveRoute, routeMetadata, RouteView } from "@/lib/site-render";
import { log404 } from "@/lib/repo/redirects";
import { headers } from "next/headers";

type Props = { params: Promise<{ host: string; path?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function load(params: Props["params"]) {
  const { host, path = [] } = await params;
  const siteId = await siteIdFromHostParam(host);
  const live = siteId ? await getPublishedSite(siteId) : null;
  if (!siteId || !live) return null;
  return { siteId, host: decodeURIComponent(host), site: live.site, path, route: resolveRoute(live.site, path) };
}

export async function generateMetadata({ params }: Props) {
  const r = await load(params);
  return r?.route ? routeMetadata(r.site, r.route) : { title: "Page not found", robots: { index: false } };
}

export default async function SitePage({ params, searchParams }: Props) {
  const r = await load(params);
  if (!r) notFound();
  // One address per site: every other domain (www/apex twin, staging address) redirects to the primary,
  // keeping the path and query string (ad click ids must survive the hop).
  const primary = await primaryHostFor(r.siteId);
  if (primary && r.host !== primary) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x !== undefined) qs.append(k, x);
    permanentRedirect(`https://${primary}/${r.path.join("/")}${qs.size ? `?${qs}` : ""}`);
  }
  if (!r.route) {
    // Old URLs keep working: the redirect manager is checked before showing a 404.
    const path = "/" + r.path.map(decodeURIComponent).join("/");
    const to = await findRedirect(r.siteId, path);
    if (to) (to.code === 301 ? permanentRedirect : redirect)(to.to_path);
    // Recorded so the owner can see broken inbound links and redirect them.
    await log404(r.siteId, path, (await headers()).get("referer"));
    notFound();
  }
  return <RouteView site={r.site} route={r.route} />;
}
