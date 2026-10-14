import Link from "next/link";
import { q } from "@/db/client";
import { requireSite } from "@/lib/auth/session";
import { listVersions } from "@/lib/repo/sites";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  await requireSite(siteId);
  const [counts] = await q<{ pages: number; products: number; collections: number; inq7: number; inqNew: number }>(
    `SELECT (SELECT count(*)::int FROM pages WHERE site_id = $1) AS pages,
            (SELECT count(*)::int FROM products WHERE site_id = $1) AS products,
            (SELECT count(*)::int FROM collections WHERE site_id = $1) AS collections,
            (SELECT count(*)::int FROM inquiries WHERE site_id = $1 AND NOT spam AND received_at > now() - interval '7 days') AS inq7,
            (SELECT count(*)::int FROM inquiries WHERE site_id = $1 AND NOT spam AND status = 'new') AS "inqNew"`, [siteId]);
  const versions = (await listVersions(siteId)).slice(0, 5);
  const recent = await q<{ id: number; form: string; fields: Record<string, unknown>; received_at: string }>(
    "SELECT id, form, fields, received_at FROM inquiries WHERE site_id = $1 AND NOT spam ORDER BY received_at DESC LIMIT 5", [siteId]);
  const base = `/admin/${siteId}`;
  return (
    <main className="a-page">
      <h1>Dashboard</h1>
      <p className="sub">Changes you make are saved as a draft. Visitors see them after you publish.</p>
      <div className="cards">
        <div className="card"><div className="muted">New inquiries</div><div className="stat-n">{counts.inqNew}</div><Link href={`${base}/inquiries`}>Open inquiries</Link></div>
        <div className="card"><div className="muted">Inquiries, last 7 days</div><div className="stat-n">{counts.inq7}</div></div>
        <div className="card"><div className="muted">Pages</div><div className="stat-n">{counts.pages}</div><Link href={`${base}/pages`}>Edit pages</Link></div>
        <div className="card"><div className="muted">Products in {counts.collections} categories</div><div className="stat-n">{counts.products}</div><Link href={`${base}/products`}>Manage products</Link></div>
      </div>
      <div className="cards" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <section className="card">
          <h2>Latest inquiries</h2>
          {recent.length === 0 && <p className="muted">No inquiries yet.</p>}
          <ul>
            {recent.map((r) => (
              <li key={r.id}><Link href={`${base}/inquiries/${r.id}`}>{String(r.fields.company || r.fields.name || r.fields.email)}</Link> <span className="muted">· {r.form} · {new Date(r.received_at).toLocaleString("en-US")}</span></li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>Recent versions</h2>
          <ul>
            {versions.map((v) => (
              <li key={v.id}>#{v.number} {v.note || v.kind} <span className="muted">· {v.author} · {new Date(v.created_at).toLocaleString("en-US")}</span></li>
            ))}
          </ul>
          <Link href={`${base}/publish`}>Publish & history</Link>
        </section>
      </div>
    </main>
  );
}
