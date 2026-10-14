import Link from "next/link";
import { requireSite } from "@/lib/auth/session";
import { listPages } from "@/lib/repo/editor";
import { NewPageForm } from "./NewPageForm";

export const metadata = { title: "Pages" };

export default async function PagesList({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  await requireSite(siteId);
  const pages = await listPages(siteId);
  return (
    <main className="a-page">
      <div className="row between">
        <div>
          <h1>Pages</h1>
          <p className="sub">Category and product pages are built automatically from Products and Categories.</p>
        </div>
      </div>
      <table className="list">
        <thead><tr><th>Page</th><th>Address</th><th>Type</th><th className="num">Blocks</th></tr></thead>
        <tbody>
          {pages.map((p) => (
            <tr key={p.id}>
              <td><Link href={`/admin/${siteId}/pages/${p.id}`}>{p.name}</Link></td>
              <td><code>{p.slug}</code></td>
              <td className="muted">{p.template.replace(/_/g, " ")}</td>
              <td className="num">{p.blocks}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="card" style={{ marginTop: 16, maxWidth: 560 }}>
        <h2>Add a page</h2>
        <NewPageForm siteId={siteId} />
      </section>
    </main>
  );
}
