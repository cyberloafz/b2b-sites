import type { ReactNode } from "react";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { logoutAction } from "@/app/admin/auth-actions";
import "@/styles/admin.css";

export const metadata = { title: { default: "Platform", template: "%s · Platform" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const me = await requirePlatformAdmin();
  return (
    <div className="a-shell platform">
      <aside className="a-side">
        <Link href="/platform" className="site-name">Platform admin</Link>
        <PlatformNav />
        <div className="sep" />
        <Link href="/admin?all=1" className="small">My sites</Link>
        <div className="me">
          <Link href="/admin/account">{me.email}</Link><br />Platform admin
          <form action={logoutAction}><button type="submit">Sign out</button></form>
        </div>
      </aside>
      <div className="a-main">{children}</div>
    </div>
  );
}
