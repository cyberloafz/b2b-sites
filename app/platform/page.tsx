import Link from "next/link";
import { needsAttention, overview } from "@/lib/platform";
import { fmtDateTime, fmtNum } from "@/lib/format";

export const metadata = { title: "Overview" };

export default async function PlatformOverview() {
  const [o, a] = await Promise.all([overview(), needsAttention()]);
  const siteTotal = Object.values(o.sites).reduce((x, y) => x + y, 0);
  const max = Math.max(1, ...o.daily.map((d) => Math.max(d.signups, d.sites, d.inquiries, d.publishes)));
  const bar = (n: number) => <span className="mini-bar" style={{ width: `${(n / max) * 100}%` }} aria-hidden />;
  return (
    <main className="a-page">
      <h1>Platform overview</h1>
      <p className="sub">All customers and sites. Figures are for the last 30 days unless noted.</p>

      <div className="cards kpis">
        <div className="card"><div className="stat-n">{siteTotal}</div>sites<div className="small muted">{o.sites.live ?? 0} live · {o.sites.draft ?? 0} draft · {o.sites.generating ?? 0} generating{o.sites.suspended ? ` · ${o.sites.suspended} suspended` : ""}</div></div>
        <div className="card"><div className="stat-n">{o.users}</div>users<div className="small muted">{o.users30} new · {o.admins} platform admin{o.admins === 1 ? "" : "s"}{o.disabled ? ` · ${o.disabled} disabled` : ""}</div></div>
        <div className="card"><div className="stat-n">{o.inquiries30}</div>inquiries to customers<div className="small muted">{o.spam30} blocked as spam</div></div>
        <div className="card"><div className="stat-n">{o.publishes30}</div>publishes<div className="small muted">{o.generations30} AI site generations</div></div>
        <div className="card"><div className="stat-n">{fmtNum(o.ai.input + o.ai.output)}</div>AI tokens<div className="small muted">{o.ai.calls} model steps · {fmtNum(o.ai.input)} in / {fmtNum(o.ai.output)} out</div></div>
        <div className="card"><div className="stat-n">{o.emails.sent ?? 0}</div>emails sent<div className="small muted">{o.emails.failed ?? 0} failed · {o.emails.skipped ?? 0} not sent (no email key)</div></div>
        <div className="card"><div className="stat-n">{o.domains.ready}</div>custom domains live<div className="small muted">{o.domains.pending} waiting for DNS/SSL</div></div>
      </div>

      <section className="card">
        <h2>Needs attention {a.total > 0 ? <span className="pill bad">{a.total}</span> : <span className="pill good">all clear</span>}</h2>
        {a.total === 0 && <p className="muted">No failed jobs, emails, webhooks or stuck domains.</p>}
        <ul className="issues">
          {a.generations.map((g) => <li key={`g${g.site_id}`}><Link href={`/platform/sites/${g.site_id}`}>{g.site_id}</Link>: AI generation {g.status === "failed" ? `failed — ${g.error ?? "unknown error"}` : "has been running for over 30 minutes"}</li>)}
          {a.jobs.map((j) => <li key={`j${j.id}`}>Background job {j.kind} {JSON.stringify(j.payload)} failed: {j.last_error}</li>)}
          {a.emails.map((e) => <li key={`e${e.id}`}>Email ({e.kind}) to {e.to_addr}{e.site_id && <> for <Link href={`/platform/sites/${e.site_id}`}>{e.site_id}</Link></>} failed: {e.last_error}</li>)}
          {a.webhooks.map((w) => <li key={`w${w.id}`}>CRM webhook for <Link href={`/platform/sites/${w.site_id}`}>{w.site_id}</Link> gave up: {w.last_error}</li>)}
          {a.domains.map((d) => <li key={`d${d.hostname}`}>Domain {d.hostname} (<Link href={`/platform/sites/${d.site_id}`}>{d.site_id}</Link>) not ready after a day{d.last_error ? `: ${d.last_error}` : ""}</li>)}
        </ul>
      </section>

      <section className="card">
        <h2>Last 14 days</h2>
        <table className="list daily">
          <thead><tr><th>Day</th><th>New users</th><th>New sites</th><th>Inquiries</th><th>Publishes</th></tr></thead>
          <tbody>
            {o.daily.map((d) => (
              <tr key={d.day}>
                <td className="small">{d.day}</td>
                <td>{d.signups} {bar(d.signups)}</td><td>{d.sites} {bar(d.sites)}</td><td>{d.inquiries} {bar(d.inquiries)}</td><td>{d.publishes} {bar(d.publishes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">Updated {fmtDateTime(new Date())}.</p>
      </section>
    </main>
  );
}
