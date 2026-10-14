import type { ReactNode } from "react";
import Link from "next/link";
import { requireSite } from "@/lib/auth/session";
import { getSiteRow, hasUnpublishedChanges, latestPublished } from "@/lib/repo/sites";
import { one } from "@/db/client";
import { SideNav } from "@/components/admin/SideNav";
import { redirect } from "next/navigation";
import { logoutAction } from "../auth-actions";

export default async function SiteAdminLayout({ children, params }: { children: ReactNode; params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const { user, role } = await requireSite(siteId);
  // A site still being planned or written by AI opens on its wizard screen instead of the editor.
  const gen = await one<{ status: string }>("SELECT status FROM site_generations WHERE site_id = $1", [siteId]);
  if (gen && ["planning", "plan_ready"].includes(gen.status)) redirect(`/admin/new/${siteId}/plan`);
  if (gen?.status === "generating") redirect(`/admin/new/${siteId}/progress`);
  const [row, live, dirty, newInquiries] = await Promise.all([
    getSiteRow(siteId),
    latestPublished(siteId),
    hasUnpublishedChanges(siteId),
    one<{ n: number }>("SELECT count(*)::int AS n FROM inquiries WHERE site_id = $1 AND status = 'new' AND NOT spam", [siteId]),
  ]);
  const domain = await one<{ hostname: string }>(
    "SELECT hostname FROM domains WHERE site_id = $1 AND verified_at IS NOT NULL ORDER BY is_primary DESC, (kind = 'custom' AND ssl_status = 'active') DESC, hostname LIMIT 1", [siteId]);
  const viewUrl = process.env.NODE_ENV === "production" && domain ? `https://${domain.hostname}` : "/";

  return (
    <div className="a-shell">
      <aside className="a-side">
        <Link href={`/admin/${siteId}`} className="site-name">{row?.name ?? siteId}</Link>
        <SideNav siteId={siteId} role={role} newInquiries={newInquiries?.n ?? 0} />
        <div className="sep" />
        <Link href="/admin?all=1" className="small">All sites</Link>
        <Link href="/admin/new" className="small">+ New site with AI</Link>
        {user.platformAdmin && <Link href="/platform" className="small">Platform admin</Link>}
        <div className="me">
          <Link href="/admin/account">{user.email}</Link><br />{role === "owner" ? "Owner" : "Editor"}
          <form action={logoutAction}><button type="submit">Sign out</button></form>
        </div>
      </aside>
      <div className="a-main">
        <header className="a-top">
          <span className="grow" />
          {live ? <span className="pill good">Live · version {live.number}</span> : <span className="pill warn">Not published yet</span>}
          {dirty && <span className="pill warn">Unpublished changes</span>}
          <a className="btn" href={viewUrl} target="_blank" rel="noopener">View live site</a>
          <Link className="btn primary" href={`/admin/${siteId}/publish`}>Review &amp; publish</Link>
        </header>
        {children}
      </div>
    </div>
  );
}
