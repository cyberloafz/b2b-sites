import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { siteDetail } from "@/lib/platform";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { SuspendSite } from "@/components/admin/PlatformControls";
import { resumeSiteAction, supportAccessAction } from "../../actions";

export const metadata = { title: "Site" };

export default async function PlatformSite({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const me = await requirePlatformAdmin();
  const d = await siteDetail(siteId);
  if (!d) notFound();
  const { site, members, domains, versions, generation, aiByStep, emails, inquiries, counts } = d;
  const isMember = members.some((m) => m.user_id === me.id);
  const main = domains.find((x) => x.is_primary && x.kind === "custom" && x.ssl_status === "active")?.hostname ?? domains.find((x) => x.kind === "staging")?.hostname;
  const tokens = aiByStep.reduce((n, s) => n + s.input + s.output, 0);
  return (
    <main className="a-page wide">
      <p><Link href="/platform/sites">← All sites</Link></p>
      <div className="row between">
        <div>
          <h1>{site.name} <span className={`pill ${site.status === "live" ? "good" : site.status === "suspended" ? "bad" : "warn"}`}>{site.status}</span></h1>
          <p className="muted">{site.company.legalName} · {site.company.address.city}, {site.company.address.region} · {site.company.email} · {site.company.phoneDisplay} · id <code>{site.id}</code> · created {fmtDate(site.created_at)}</p>
          {site.status === "suspended" && <p className="err">Offline. Reason: {site.suspended_reason}</p>}
        </div>
        <div className="row">
          {main && site.status === "live" && <a className="btn" href={`https://${main}`} target="_blank" rel="noopener">Open live site</a>}
          {isMember ? (
            <>
              <Link className="btn primary" href={`/admin/${site.id}`}>Open site admin</Link>
              <ConfirmButton label="End support access" confirmLabel="Leave this site's team" action={supportAccessAction.bind(null, site.id, false)} />
            </>
          ) : (
            <ConfirmButton label="Get support access" confirmLabel="Join as owner (customer will see you in Team)" action={supportAccessAction.bind(null, site.id, true)} />
          )}
          {site.status === "suspended"
            ? <ConfirmButton label="Resume site" confirmLabel="Put the site back online" action={resumeSiteAction.bind(null, site.id)} />
            : <SuspendSite siteId={site.id} />}
        </div>
      </div>

      <div className="cards kpis">
        <div className="card"><div className="stat-n">{counts.pages}</div>pages · {counts.products} products · {counts.collections} categories</div>
        <div className="card"><div className="stat-n">{inquiries.d30}</div>inquiries in 30 days<div className="small muted">{inquiries.total} total · {inquiries.spam} spam · last {fmtDate(inquiries.last)}</div></div>
        <div className="card"><div className="stat-n">{versions.length ? `v${versions.length >= 10 ? "10+" : versions.length}` : "—"}</div>published versions<div className="small muted">last {fmtDate(versions[0]?.created_at)}</div></div>
        <div className="card"><div className="stat-n">{fmtNum(tokens)}</div>AI tokens<div className="small muted">{generation ? `generation ${generation.status} (${generation.provider === "mock" ? "demo writer" : generation.provider})` : "built without AI"}</div></div>
      </div>

      <div className="cards" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
        <section className="card">
          <h2>Team</h2>
          <table className="list">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th></tr></thead>
            <tbody>{members.map((m) => <tr key={m.user_id}><td>{m.name}{m.user_id === me.id && <span className="pill">support</span>}{m.disabled && <span className="pill bad">disabled</span>}</td><td className="small">{m.email}</td><td>{m.role}</td><td className="small">{fmtDate(m.last_login_at)}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="card">
          <h2>Domains</h2>
          <table className="list">
            <thead><tr><th>Domain</th><th>State</th></tr></thead>
            <tbody>{domains.map((x) => (
              <tr key={x.hostname}>
                <td>{x.hostname}{x.is_primary && x.kind === "custom" && <span className="pill good">main</span>}</td>
                <td className="small">{x.kind === "staging" ? "platform address" : !x.verified_at ? "waiting for TXT" : !x.dns_ok ? "waiting for CNAME/A" : `SSL ${x.ssl_status}`}{x.last_error && x.kind === "custom" && <div className="muted">{x.last_error}</div>}</td>
              </tr>))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2>AI usage</h2>
          {aiByStep.length === 0 ? <p className="muted">No model calls.</p> : (
            <table className="list">
              <thead><tr><th>Step</th><th className="num">Calls</th><th className="num">Failed</th><th className="num">Tokens in</th><th className="num">Tokens out</th></tr></thead>
              <tbody>{aiByStep.map((s) => <tr key={s.step}><td>{s.step}</td><td className="num">{s.calls}</td><td className="num">{s.failed}</td><td className="num">{fmtNum(s.input)}</td><td className="num">{fmtNum(s.output)}</td></tr>)}</tbody>
            </table>
          )}
          {generation?.error && <p className="err">{generation.error}</p>}
          {aiByStep[0]?.model && <p className="hint">Model: {aiByStep.find((s) => s.model)?.model}</p>}
        </section>
        <section className="card">
          <h2>Recent publishes</h2>
          <table className="list">
            <tbody>{versions.map((v) => <tr key={v.id}><td className="small">{fmtDateTime(v.created_at)}</td><td>{v.note || v.kind}</td><td className="small muted">{v.author}</td></tr>)}</tbody>
          </table>
          {!versions.length && <p className="muted">Never published.</p>}
        </section>
      </div>

      <section className="card">
        <h2>Recent emails</h2>
        <table className="list">
          <thead><tr><th>When</th><th>Kind</th><th>To</th><th>Status</th></tr></thead>
          <tbody>{emails.map((e) => <tr key={e.id}><td className="small">{fmtDateTime(e.created_at)}</td><td>{e.kind}</td><td className="small">{e.to_addr}</td><td><span className={`pill ${e.status === "sent" ? "good" : e.status === "failed" ? "bad" : "warn"}`}>{e.status}</span>{e.last_error && <div className="small muted">{e.last_error}</div>}</td></tr>)}</tbody>
        </table>
        {!emails.length && <p className="muted">No emails yet.</p>}
      </section>
    </main>
  );
}
