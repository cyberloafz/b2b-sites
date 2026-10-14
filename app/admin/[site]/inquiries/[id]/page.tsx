import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSite } from "@/lib/auth/session";
import { FORM_LABEL, getInquiry, sourceSummary } from "@/lib/repo/inquiries";
import { StatusSelect } from "@/components/admin/StatusSelect";

export const metadata = { title: "Inquiry" };

const label = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export default async function InquiryDetail({ params }: { params: Promise<{ site: string; id: string }> }) {
  const { site: siteId, id } = await params;
  await requireSite(siteId);
  const r = await getInquiry(siteId, Number(id));
  if (!r) notFound();
  const { inq, emails, hooks } = r;
  const f = inq.fields as Record<string, unknown>;
  return (
    <main className="a-page" style={{ maxWidth: 900 }}>
      <p><Link href={`/admin/${siteId}/inquiries`}>← Inquiries</Link></p>
      <div className="row between">
        <div>
          <h1>{String(f.company || f.name || f.email)}</h1>
          <p className="sub">{FORM_LABEL[inq.form] ?? inq.form} · {new Date(inq.received_at).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}{inq.spam && " · marked as spam"}</p>
        </div>
        <StatusSelect siteId={siteId} id={inq.id} value={inq.status} />
      </div>
      <section className="card">
        <h2>Request</h2>
        <dl className="kv">
          {Object.entries(f).filter(([k]) => k !== "form").map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}><dt>{label(k)}</dt><dd>{Array.isArray(v) ? v.join(", ") : String(v ?? "")}</dd></div>
          ))}
          <dt>Marketing emails</dt><dd>{inq.marketing_consent ? "Opted in" : "Not opted in"}</dd>
        </dl>
        {typeof f.email === "string" && <p style={{ marginTop: 12 }}><a className="btn primary" href={`mailto:${f.email}`}>Reply by email</a></p>}
      </section>
      <section className="card">
        <h2>Where it came from: {sourceSummary(inq.source)}</h2>
        <dl className="kv">
          {Object.entries(inq.source).map(([k, v]) => <div key={k} style={{ display: "contents" }}><dt>{label(k)}</dt><dd>{v}</dd></div>)}
        </dl>
      </section>
      <section className="card">
        <h2>Notifications</h2>
        <table className="list">
          <thead><tr><th>Type</th><th>To</th><th>Status</th></tr></thead>
          <tbody>
            {emails.map((e, i) => <tr key={i}><td>{e.kind === "notify" ? "Team notification" : "Auto-reply"}</td><td>{e.to_addr}</td><td>{e.status}{e.last_error && <div className="muted small">{e.last_error}</div>}</td></tr>)}
            {hooks.map((h, i) => <tr key={`h${i}`}><td>CRM webhook</td><td className="small">{h.url}</td><td>{h.status} ({h.attempts} attempt{h.attempts === 1 ? "" : "s"}){h.last_error && <div className="muted small">{h.last_error}</div>}</td></tr>)}
            {!emails.length && !hooks.length && <tr><td colSpan={3} className="muted">None (spam is not forwarded).</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}
