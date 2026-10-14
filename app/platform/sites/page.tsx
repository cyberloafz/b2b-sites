import Link from "next/link";
import { listAllSites } from "@/lib/platform";
import { fmtDate, fmtNum } from "@/lib/format";

export const metadata = { title: "Sites" };

const tone: Record<string, string> = { live: "good", draft: "warn", generating: "warn", suspended: "bad" };

export default async function PlatformSites({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const f = await searchParams;
  const sites = await listAllSites({ q: f.q?.slice(0, 100), status: f.status });
  return (
    <main className="a-page wide">
      <h1>Sites</h1>
      <form className="filters row" role="search">
        <input name="q" defaultValue={f.q} placeholder="Search by site, owner email or domain" aria-label="Search sites" />
        <select name="status" defaultValue={f.status ?? ""} aria-label="Status">
          <option value="">All statuses</option>
          <option value="live">Live</option><option value="draft">Draft</option><option value="generating">Generating</option><option value="suspended">Suspended</option>
        </select>
        <button type="submit">Filter</button>
        <span className="muted small">{sites.length} site{sites.length === 1 ? "" : "s"}</span>
      </form>
      <table className="list">
        <thead><tr><th>Site</th><th>Owner</th><th>Status</th><th>Address</th><th className="num">Products</th><th className="num">Inquiries 30d</th><th>Last publish</th><th className="num">AI tokens</th><th>Created</th></tr></thead>
        <tbody>
          {sites.map((s) => (
            <tr key={s.id}>
              <td><Link href={`/platform/sites/${s.id}`}><strong>{s.name}</strong></Link><div className="small muted">{s.id}</div></td>
              <td className="small">{s.owners ?? "—"}</td>
              <td><span className={`pill ${tone[s.status] ?? ""}`}>{s.status}</span>{s.generation && s.generation !== "done" && <div className="small muted">AI: {s.generation}</div>}</td>
              <td className="small">{s.main ? <a href={`https://${s.main}`} target="_blank" rel="noopener">{s.main}</a> : s.staging ?? "—"}</td>
              <td className="num">{s.products}</td>
              <td className="num">{s.inquiries30}</td>
              <td className="small">{fmtDate(s.last_publish)}{s.versions > 0 && <span className="muted"> · v{s.versions}</span>}</td>
              <td className="num">{fmtNum(s.tokens)}</td>
              <td className="small">{fmtDate(s.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!sites.length && <p className="muted">No sites match.</p>}
    </main>
  );
}
