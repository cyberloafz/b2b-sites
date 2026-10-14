import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireSite } from "@/lib/auth/session";
import { assembleDraft } from "@/lib/repo/sites";
import { SiteShell } from "@/components/SiteShell";
import "@/styles/site.css";

export const metadata = { robots: { index: false, follow: false } };

/** Draft preview for signed-in editors: same components as the live site, data from the draft tables. */
export default async function PreviewLayout({ children, params }: { children: ReactNode; params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  await requireSite(siteId);
  const draft = await assembleDraft(siteId);
  if (!draft) notFound();
  return <SiteShell site={draft.site} previewBase={`/preview/${siteId}`}>{children}</SiteShell>;
}
