import { notFound } from "next/navigation";
import { requireSite } from "@/lib/auth/session";
import { getPage } from "@/lib/repo/editor";
import { editorContext } from "@/lib/admin/context";
import { blockJsonSchema, pageSettingsJsonSchema } from "@/lib/admin/schemas";
import { ADDABLE, BLOCK_LABELS } from "@/lib/block-defaults";
import { BLOCKS, type BlockType } from "@/schema/blocks";
import { PageEditor } from "@/components/admin/PageEditor";
import { uploadMediaAction } from "../../actions";

export async function generateMetadata({ params }: { params: Promise<{ site: string; pageId: string }> }) {
  const { site, pageId } = await params;
  const p = await getPage(site, Number(pageId));
  return { title: p ? `Edit ${p.name}` : "Page" };
}

export default async function EditPage({ params, searchParams }: { params: Promise<{ site: string; pageId: string }>; searchParams: Promise<{ block?: string }> }) {
  const { site: siteId, pageId } = await params;
  await requireSite(siteId);
  const page = await getPage(siteId, Number(pageId));
  if (!page) notFound();
  const ctx = await editorContext(siteId);
  const schemas = Object.fromEntries((Object.keys(BLOCKS) as BlockType[]).map((t) => [t, blockJsonSchema(t)]));
  const { block } = await searchParams;
  return (
    <PageEditor
      siteId={siteId}
      page={{ id: page.id, slug: page.slug, name: page.name, template: page.template, seo: page.seo }}
      sections={page.sections}
      schemas={schemas}
      settingsSchema={pageSettingsJsonSchema()}
      ctx={{ ...ctx, upload: uploadMediaAction.bind(null, siteId) }}
      addable={ADDABLE.map((t) => ({ type: t, ...BLOCK_LABELS[t] }))}
      labels={Object.fromEntries(Object.entries(BLOCK_LABELS).map(([k, v]) => [k, v.name]))}
      initialSelected={block ? Number(block) : page.sections[0]?.id ?? "settings"}
    />
  );
}
