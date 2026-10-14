import Link from "next/link";
import { requireSite } from "@/lib/auth/session";
import { listCollections } from "@/lib/repo/editor";
import { wordCount } from "@/lib/seo";

export const metadata = { title: "Categories" };

export default async function CategoriesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  await requireSite(siteId);
  const cols = await listCollections(siteId);
  const base = `/admin/${siteId}/categories`;
  return (
    <main className="a-page">
      <div className="row between">
        <div>
          <h1>Categories</h1>
          <p className="sub">Each category is a landing page for searches like “private label serums”. It is indexed once it has 3+ products and a 120+ word intro.</p>
        </div>
        <Link className="btn primary" href={`${base}/new`}>New category</Link>
      </div>
      <table className="list">
        <thead><tr><th>Category</th><th>Address</th><th className="num">Products</th><th className="num">Intro words</th><th>Search engines</th></tr></thead>
        <tbody>
          {cols.map((c) => {
            const words = wordCount(c.data.intro);
            const indexable = c.products >= 3 && words >= 120 && !c.data.seo.noindex;
            return (
              <tr key={c.slug}>
                <td><Link href={`${base}/${c.slug}`}>{c.data.name}</Link></td>
                <td><code>/products/{c.slug}</code></td>
                <td className="num">{c.products}</td>
                <td className="num">{words}</td>
                <td>{indexable ? <span className="pill good">Indexed</span> : <span className="pill warn">Hidden until ready</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
