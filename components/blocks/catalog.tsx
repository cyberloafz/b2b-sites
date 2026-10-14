import Link from "next/link";
import type { BlockOf } from "@/schema/blocks";
import type { Product } from "@/schema/site";
import { Btn, Heading, Img, Sub, collectionPath, productPath, type BlockCtx } from "./shared";

export function CategoryTiles({ b, ctx }: { b: BlockOf<"category_tiles">; ctx: BlockCtx }) {
  const cols = b.categories.map((slug) => ctx.site.collections.find((c) => c.slug === slug)!).filter(Boolean);
  return (
    <section className="section">
      <div className="container">
        {b.heading && <Heading primary={ctx.primary} className="section-title">{b.heading}</Heading>}
        {b.intro && <p className="section-intro">{b.intro}</p>}
        <ul className="tiles">
          {cols.map((c) => {
            const n = ctx.site.products.filter((p) => p.collection === c.slug).length;
            return (
              <li key={c.slug}>
                <Link href={collectionPath(c)} className="tile">
                  <Img image={c.image} sizes="(max-width: 900px) 50vw, 25vw" />
                  <span className="tile-label">
                    <span className="tile-name">{c.shortName}</span>
                    <span className="muted small">{n} {n === 1 ? "product" : "products"}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function resolveProducts(b: BlockOf<"product_grid">, ctx: BlockCtx): Product[] {
  const all = ctx.site.products;
  const s = b.source;
  const list =
    s.kind === "collection" ? all.filter((p) => p.collection === s.collection)
    : s.kind === "manual" ? s.products.map((slug) => all.find((p) => p.slug === slug)!).filter(Boolean)
    : s.kind === "featured" ? all.filter((p) => p.featured)
    : all.filter((p) => ctx.product && p.collection === ctx.product.collection && p.slug !== ctx.product.slug);
  return list.slice(0, b.limit);
}

export function ProductGrid({ b, ctx }: { b: BlockOf<"product_grid">; ctx: BlockCtx }) {
  const items = resolveProducts(b, ctx);
  if (!items.length) return null;
  return (
    <section className="section" id="products">
      <div className="container">
        <div className="section-head">
          {b.heading && <Heading primary={ctx.primary} className="section-title">{b.heading}</Heading>}
          {b.viewAll && <Btn link={b.viewAll} variant="secondary" />}
        </div>
        <ul className="product-grid">
          {items.map((p) => (
            <li key={p.slug}>
              {/* One link, one title: RSL printed every card title twice. */}
              <Link href={productPath(p)} className="product-card">
                <Img image={p.image} sizes="(max-width: 700px) 50vw, (max-width: 1000px) 33vw, 25vw" />
                <Sub primary={ctx.primary} className="product-name">{p.name}</Sub>
                <p className="muted small">{p.summary}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ProductDetail({ b, ctx }: { b: BlockOf<"product_detail">; ctx: BlockCtx }) {
  const p = ctx.product;
  if (!p) return null;
  const quote = b.ctas?.[0] ?? { label: "Request a Quote", href: `/contact?product=${p.slug}` };
  const sample = b.ctas?.[1] ?? { label: "Order a Sample", href: `/request-samples?product=${p.slug}` };
  return (
    <section className="section product-detail">
      <div className="container split top">
        <div className="pd-media">
          <Img image={p.image} eager className="rounded" />
        </div>
        <div className="pd-info">
          {ctx.collection && <p className="eyebrow"><Link href={collectionPath(ctx.collection)}>{ctx.collection.name}</Link></p>}
          <Heading primary={ctx.primary} className="display-sm">{p.name}</Heading>
          <p className="lead">{p.summary}</p>
          <ul className="checks">
            {p.highlights.map((h) => <li key={h}>{h}</li>)}
          </ul>
          <div className="pd-sizes">
            <Sub primary={ctx.primary} className="label">Available sizes</Sub>
            <ul className="chips">
              {p.packaging.map((x) => <li key={x.label}>{x.label}</li>)}
            </ul>
          </div>
          {p.priceNote?.show && <p className="price-note">{p.priceNote.text}</p>}
          <div className="actions">
            <Btn link={quote} />
            <Btn link={sample} variant="secondary" />
          </div>
          {b.showSpecSheet && p.specSheetUrl && (
            <p className="small"><a href={p.specSheetUrl}>Download spec sheet (PDF)</a></p>
          )}
          {p.sku && <p className="muted small">SKU {p.sku}</p>}
        </div>
      </div>
      <div className="container pd-more">
        <div className="pd-panel">
          <Sub primary={ctx.primary}>Description</Sub>
          <p>{p.description}</p>
          {p.usage && (
            <>
              <Sub primary={ctx.primary}>How to use</Sub>
              <p>{p.usage}</p>
            </>
          )}
          {p.composition && (
            <>
              <Sub primary={ctx.primary}>{p.composition.label}</Sub>
              <p className="small">{p.composition.text}</p>
            </>
          )}
        </div>
        <div className="pd-panel">
          <Sub primary={ctx.primary}>Specifications</Sub>
          <table className="spec-table">
            <tbody>
              {p.specs.map((s) => (
                <tr key={s.label}>
                  <th scope="row">{s.label}</th>
                  <td>{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
