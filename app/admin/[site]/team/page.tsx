import { requireSite } from "@/lib/auth/session";
import { listInvitations, listMembers } from "@/lib/auth/accounts";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { InviteForm, RoleSelect } from "@/components/admin/TeamControls";
import { removeMemberAction, revokeInviteAction } from "../team-actions";

export const metadata = { title: "Team" };

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "never");

export default async function TeamPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const { user } = await requireSite(siteId, "owner");
  const [members, invites] = await Promise.all([listMembers(siteId), listInvitations(siteId)]);
  return (
    <main className="a-page">
      <h1>Team</h1>
      <p className="muted">Owners can change everything, including domains, theme, team and settings. Editors change pages, products, images and inquiries, and can publish.</p>

      <section className="card">
        <h2>Invite someone</h2>
        <InviteForm siteId={siteId} />
      </section>

      <section className="card">
        <h2>Members ({members.length})</h2>
        <table className="list">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th><th /></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id}>
                <td>{m.name}{m.user_id === user.id && <span className="muted"> (you)</span>}</td>
                <td>{m.email}</td>
                <td><RoleSelect siteId={siteId} userId={m.user_id} role={m.role} label={`Role for ${m.name}`} /></td>
                <td className="small">{fmt(m.last_login_at)}</td>
                <td>
                  <ConfirmButton label={m.user_id === user.id ? "Leave" : "Remove"} confirmLabel={m.user_id === user.id ? "Leave this site" : `Remove ${m.name}`}
                    action={removeMemberAction.bind(null, siteId, m.user_id)} then={m.user_id === user.id ? "/admin?all=1" : undefined} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {invites.length > 0 && (
        <section className="card">
          <h2>Pending invitations</h2>
          <table className="list">
            <thead><tr><th>Email</th><th>Role</th><th>Expires</th><th /></tr></thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td><td>{i.role}</td><td className="small">{fmt(i.expires_at)}</td>
                  <td><ConfirmButton label="Cancel invitation" confirmLabel="Yes, cancel" action={revokeInviteAction.bind(null, siteId, i.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
