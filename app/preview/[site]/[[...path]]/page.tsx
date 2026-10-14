import { notFound } from "next/navigation";
import { requireSite } from "@/lib/auth/session";
import { assembleDraft } from "@/lib/repo/sites";
import { resolveRoute, routeMetadata, RouteView } from "@/lib/site-render";

type Props = { params: Promise<{ site: string; path?: string[] }> };

export async function generateMetadata({ params }: Props) {
  const { site: siteId, path = [] } = await params;
  const draft = await assembleDraft(siteId);
  const r = draft && resolveRoute(draft.site, path);
  return r && draft ? { ...routeMetadata(draft.site, r), robots: { index: false, follow: false } } : {};
}

export default async function PreviewPage({ params }: Props) {
  const { site: siteId, path = [] } = await params;
  await requireSite(siteId);
  const draft = await assembleDraft(siteId);
  const route = draft && resolveRoute(draft.site, path);
  if (!draft || !route) notFound();
  return <RouteView site={draft.site} route={route} />;
}
