import Link from "next/link";
import { listAudit } from "@/lib/platform";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Audit log" };

const LABEL: Record<string, string> = {
  "site.suspend": "Suspended site", "site.resume": "Resumed site", "support.join": "Got support access to", "support.leave": "Ended support access to",
  "user.disable": "Disabled user", "user.enable": "Enabled user", "user.make_admin": "Made platform admin", "user.remove_admin": "Removed platform admin",
};

export default async function PlatformAudit() {
  const rows = await listAudit();
  return (
    <main className="a-page">
      <h1>Audit log</h1>
      <p className="sub">Every action taken in the platform admin, newest first.</p>
      <table className="list">
        <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="small">{fmtDateTime(r.created_at)}</td>
              <td className="small">{r.actor}</td>
              <td>{LABEL[r.action] ?? r.action} {r.action.startsWith("site.") || r.action.startsWith("support.") ? <Link href={`/platform/sites/${r.target}`}>{r.target}</Link> : <strong>{r.target}</strong>}</td>
              <td className="small muted">{Object.keys(r.detail).length ? Object.entries(r.detail).map(([k, v]) => `${k}: ${String(v)}`).join("; ") : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="muted">Nothing yet.</p>}
    </main>
  );
}
