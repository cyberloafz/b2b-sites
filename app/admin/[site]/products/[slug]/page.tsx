import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSite } from "@/lib/auth/session";
import { getProduct, listCollections } from "@/lib/repo/editor";
import { editorContext } from "@/lib/admin/context";
import { productJsonSchema } from "@/lib/admin/schemas";
import { EditForm } from "@/components/admin/EditForm";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { deleteProductAction, saveProductAction, uploadMediaAction } from "../../actions";

export async function generateMetadata({ params }: { params: Promise<{ site: string; slug: string }> }) {
  const { site, slug } = await params;
  return { title: slug === "new" ? "New product" : (await getProduct(site, slug))?.data.name ?? "Product" };
}

export default async function ProductEdit({ params }: { params: Promise<{ site: string; slug: string }> }) {
  const { site: siteId, slug } = await params;
  await requireSite(siteId);
  const isNew = slug === "new";
  const existing = isNew ? null : await getProduct(siteId, slug);
  if (!isNew && !existing) notFound();
  const cols = await listCollections(siteId);
  const ctx = { ...(await editorContext(siteId)), upload: uploadMediaAction.bind(null, siteId) };
  const base = `/admin/${siteId}/products`;
  const value = existing?.data ?? {
    slug: "", name: "", collection: cols[0]?.slug ?? "", summary: "", description: "",
    highlights: ["", ""], specs: [], packaging: [{ label: "" }],
    image: { src: "/images/placeholder-product.svg", alt: "", width: 800, height: 800 }, seo: { noindex: false },
  };
  return (
    <main className="a-page" style={{ maxWidth: 820 }}>
      <p><Link href={base}>← Products</Link></p>
      <div className="row between">
        <h1>{existing?.data.name ?? "New product"}</h1>
        {existing && <a className="btn" href={`/preview/${siteId}/products/${existing.data.collection}/${existing.data.slug}`} target="_blank" rel="noopener">Preview page</a>}
      </div>
      <p className="sub">Changing the address or category keeps old links working with an automatic redirect.</p>
      <section className="card">
        <EditForm
          schema={productJsonSchema()}
          value={value}
          ctx={ctx}
          action={saveProductAction.bind(null, siteId, existing ? slug : null)}
          redirectBase={base}
          submitLabel={isNew ? "Create product" : "Save"}
          extraActions={existing && <ConfirmButton label="Delete product" confirmLabel="Confirm: delete" action={deleteProductAction.bind(null, siteId, slug)} then={base} />}
        />
      </section>
    </main>
  );
}
