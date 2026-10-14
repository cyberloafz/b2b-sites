import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSite } from "@/lib/auth/session";
import { getCollection } from "@/lib/repo/editor";
import { getSiteRow } from "@/lib/repo/sites";
import { editorContext } from "@/lib/admin/context";
import { collectionJsonSchema } from "@/lib/admin/schemas";
import { EditForm } from "@/components/admin/EditForm";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { deleteCollectionAction, saveCollectionAction, uploadMediaAction } from "../../actions";

export async function generateMetadata({ params }: { params: Promise<{ site: string; slug: string }> }) {
  const { site, slug } = await params;
  return { title: slug === "new" ? "New category" : (await getCollection(site, slug))?.data.name ?? "Category" };
}

export default async function CategoryEdit({ params }: { params: Promise<{ site: string; slug: string }> }) {
  const { site: siteId, slug } = await params;
  await requireSite(siteId);
  const isNew = slug === "new";
  const existing = isNew ? null : await getCollection(siteId, slug);
  if (!isNew && !existing) notFound();
  const services = (await getSiteRow(siteId))!.services;
  const ctx = { ...(await editorContext(siteId)), upload: uploadMediaAction.bind(null, siteId) };
  const base = `/admin/${siteId}/categories`;
  const value = existing?.data ?? {
    slug: "", name: "", shortName: "", service: services[0]?.slug ?? "", intro: "",
    image: { src: "/images/placeholder-product.svg", alt: "", width: 800, height: 800 }, seo: { noindex: false },
  };
  return (
    <main className="a-page" style={{ maxWidth: 820 }}>
      <p><Link href={base}>← Categories</Link></p>
      <div className="row between">
        <h1>{existing?.data.name ?? "New category"}</h1>
        {existing && <a className="btn" href={`/preview/${siteId}/products/${existing.data.slug}`} target="_blank" rel="noopener">Preview page</a>}
      </div>
      <p className="sub">Write an intro that only fits this category: who buys it, what the range covers, how to order. Renaming keeps old links working.</p>
      <section className="card">
        <EditForm
          schema={collectionJsonSchema()}
          value={value}
          ctx={ctx}
          action={saveCollectionAction.bind(null, siteId, existing ? slug : null)}
          redirectBase={base}
          submitLabel={isNew ? "Create category" : "Save"}
          extraActions={existing && <ConfirmButton label="Delete category" confirmLabel="Confirm: delete" action={deleteCollectionAction.bind(null, siteId, slug)} then={base} />}
        />
      </section>
    </main>
  );
}
