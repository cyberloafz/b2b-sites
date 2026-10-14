import Link from "next/link";
import { requireSite } from "@/lib/auth/session";
import { listCollections, listProducts } from "@/lib/repo/editor";

export const metadata = { title: "Products" };

export default async function ProductsPage({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<{ category?: string; q?: string }> }) {
  const { site: siteId } = await params;
  await requireSite(siteId);
  const { category, q } = await searchParams;
  const [all, cols] = await Promise.all([listProducts(siteId), listCollections(siteId)]);
  const needle = q?.toLowerCase().trim();
  const rows = all.filter((p) => (!category || p.collection === category) && (!needle || `${p.data.name} ${p.data.sku ?? ""}`.toLowerCase().includes(needle)));
  const colName = new Map(cols.map((c) => [c.slug, c.data.shortName]));
  const base = `/admin/${siteId}/products`;
  return (
    <main className="a-page">
      <div className="row between">
        <div><h1>Products</h1><p className="sub">{all.length} products. Each one gets its own page under its category.</p></div>
        <div className="row">
          <Link className="btn" href={`${base}/import`}>Import from spreadsheet</Link>
          <Link className="btn primary" href={`${base}/new`}>New product</Link>
        </div>
      </div>
      <form className="filters">
        <select name="category" defaultValue={category ?? ""} aria-label="Category">
          <option value="">All categories</option>
          {cols.map((c) => <option key={c.slug} value={c.slug}>{c.data.shortName} ({c.products})</option>)}
        </select>
        <input name="q" defaultValue={q} placeholder="Search name or SKU" aria-label="Search" />
        <button>Filter</button>
      </form>
      <table className="list">
        <thead><tr><th>Product</th><th>Category</th><th>SKU</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((p) => {
            const todo = JSON.stringify(p.data).includes("[[TODO:");
            return (
              <tr key={p.slug}>
                <td><Link href={`${base}/${p.slug}`}>{p.data.name}</Link><div className="muted small">{p.data.summary}</div></td>
                <td>{colName.get(p.collection) ?? p.collection}</td>
                <td className="muted">{p.data.sku}</td>
                <td>{todo ? <span className="pill warn">Needs content</span> : p.data.featured ? <span className="pill">Featured</span> : ""}</td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={4} className="muted">No products match.</td></tr>}
        </tbody>
      </table>
    </main>
  );
}
