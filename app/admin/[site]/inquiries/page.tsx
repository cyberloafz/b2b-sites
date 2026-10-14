import Link from "next/link";
import { requireSite } from "@/lib/auth/session";
import { FORM_LABEL, STATUSES, STATUS_LABEL, listInquiries, sourceSummary, type InquiryFilter } from "@/lib/repo/inquiries";
import { StatusSelect } from "@/components/admin/StatusSelect";

export const metadata = { title: "Inquiries" };

type SP = { status?: string; form?: string; channel?: string; q?: string; spam?: string; from?: string; to?: string };

export default async function InquiriesPage({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<SP> }) {
  const { site: siteId } = await params;
  await requireSite(siteId);
  const sp = await searchParams;
  const filter: InquiryFilter = { ...sp, spam: sp.spam === "1" };
  const rows = await listInquiries(siteId, filter);
  const base = `/admin/${siteId}/inquiries`;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <main className="a-page wide">
      <div className="row between">
        <div><h1>Inquiries</h1><p className="sub">Every form submission from the website, with the channel it came from.</p></div>
        <a className="btn" href={`${base}/export${qs ? `?${qs}` : ""}`}>Export CSV</a>
      </div>
      <form className="filters">
        <select name="status" defaultValue={sp.status ?? ""} aria-label="Status">
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select name="form" defaultValue={sp.form ?? ""} aria-label="Form">
          <option value="">Any form</option>
          {Object.entries(FORM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="channel" defaultValue={sp.channel ?? ""} aria-label="Channel">
          <option value="">Any channel</option>
          <option value="ads">Paid ads (click ID)</option>
          <option value="utm">Tagged campaigns (UTM)</option>
          <option value="organic">Search, referral &amp; direct</option>
        </select>
        <input type="date" name="from" defaultValue={sp.from} aria-label="From date" />
        <input type="date" name="to" defaultValue={sp.to} aria-label="To date" />
        <input name="q" defaultValue={sp.q} placeholder="Search name, company, email…" aria-label="Search" />
        <label className="row small"><input type="checkbox" name="spam" value="1" defaultChecked={sp.spam === "1"} /> Show spam</label>
        <button>Filter</button>
        {qs && <Link className="btn" href={base}>Clear</Link>}
      </form>
      <table className="list">
        <thead><tr><th>Received</th><th>From</th><th>Form</th><th>Details</th><th>Channel</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const f = r.fields as Record<string, string | string[]>;
            const detail = f.product || (Array.isArray(f.products) ? f.products.join(", ") : "") || f.productType || f.message || f.description || "";
            return (
              <tr key={r.id}>
                <td className="small">{new Date(r.received_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td><Link href={`${base}/${r.id}`}>{String(f.company || f.name || f.email)}</Link><div className="muted small">{String(f.email ?? "")}</div></td>
                <td>{FORM_LABEL[r.form] ?? r.form}</td>
                <td className="small" style={{ maxWidth: 280 }}>{String(detail).slice(0, 90)}{f.quantity ? <div className="muted">{String(f.quantity)}</div> : null}</td>
                <td className="small">{sourceSummary(r.source)}</td>
                <td><StatusSelect siteId={siteId} id={r.id} value={r.status} /></td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={6} className="muted">No inquiries match these filters.</td></tr>}
        </tbody>
      </table>
    </main>
  );
}
