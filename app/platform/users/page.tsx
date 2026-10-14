import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { listUsers } from "@/lib/platform";
import { fmtDate } from "@/lib/format";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { platformAdminAction, userDisabledAction } from "../actions";

export const metadata = { title: "Users" };

export default async function PlatformUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requirePlatformAdmin();
  const f = await searchParams;
  const users = await listUsers({ q: f.q?.slice(0, 100) });
  return (
    <main className="a-page wide">
      <h1>Users</h1>
      <form className="filters row" role="search">
        <input name="q" defaultValue={f.q} placeholder="Search by email or name" aria-label="Search users" />
        <button type="submit">Search</button>
        <span className="muted small">{users.length} user{users.length === 1 ? "" : "s"}</span>
      </form>
      <table className="list">
        <thead><tr><th>User</th><th>Sites</th><th>Sign-in</th><th>Created</th><th>Last sign-in</th><th>Access</th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.name}</strong><div className="small muted">{u.email}</div></td>
              <td className="small">{u.sites ? u.sites.split(", ").map((s) => { const [id, role] = s.split(":"); return <div key={id}><Link href={`/platform/sites/${id}`}>{id}</Link> <span className="muted">{role}</span></div>; }) : "—"}</td>
              <td className="small">{u.google ? "Google + " : ""}password</td>
              <td className="small">{fmtDate(u.created_at)}</td>
              <td className="small">{fmtDate(u.last_login_at)}</td>
              <td>{u.platform_admin && <span className="pill">platform admin</span>}{u.disabled_at && <span className="pill bad">disabled {fmtDate(u.disabled_at)}</span>}</td>
              <td>
                {u.id !== me.id && (
                  <span className="row">
                    {u.disabled_at
                      ? <ConfirmButton label="Enable" confirmLabel={`Enable ${u.email}`} action={userDisabledAction.bind(null, u.id, false)} />
                      : <ConfirmButton label="Disable" confirmLabel={`Disable and sign out ${u.email}`} action={userDisabledAction.bind(null, u.id, true)} />}
                    {u.platform_admin
                      ? <ConfirmButton label="Remove admin" confirmLabel="Remove platform admin" action={platformAdminAction.bind(null, u.id, false)} />
                      : !u.disabled_at && <ConfirmButton label="Make admin" confirmLabel="Give full platform access" action={platformAdminAction.bind(null, u.id, true)} />}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
