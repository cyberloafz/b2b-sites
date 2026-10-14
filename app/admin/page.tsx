import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { listSites } from "@/lib/repo/sites";

export const metadata = { title: "Your sites" };

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ denied?: string; all?: string; reset?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  const mine = new Map(user.sites.map((s) => [s.siteId, s.role]));
  const sites = (await listSites()).filter((s) => mine.has(s.id));
  const { denied, all, reset } = await searchParams;
  if (sites.length === 1 && !denied && !all && !reset) redirect(`/admin/${sites[0].id}`);
  return (
    <main className="a-page">
      <div className="row between">
        <h1>Your sites</h1>
        <span className="row">
          {user.platformAdmin && <Link className="btn" href="/platform">Platform admin</Link>}
          <Link className="btn primary" href="/admin/new">New site with AI</Link>
        </span>
      </div>
      {reset && <p className="ok" role="status">Your password was changed. You are signed in.</p>}
      {denied && <p className="err">You do not have access to that site or action.</p>}
      {!sites.length && <p className="muted">No sites yet. Create your first one with AI.</p>}
      <table className="list">
        <thead><tr><th>Site</th><th>Status</th><th>Your role</th></tr></thead>
        <tbody>
          {sites.map((s) => (
            <tr key={s.id}>
              <td><Link href={`/admin/${s.id}`}>{s.name}</Link></td>
              <td>{s.status}</td>
              <td>{mine.get(s.id)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
