import { assembleDraft } from "@/lib/repo/sites";
import { listMedia } from "@/lib/repo/media";
import type { FormCtx, MediaItem } from "@/components/admin/SchemaForm";

/** Everything the form engine needs to offer pickers: site paths, categories, products, images. */
export async function editorContext(siteId: string): Promise<FormCtx> {
  const [draft, uploads] = await Promise.all([assembleDraft(siteId), listMedia(siteId)]);
  const site = draft!.site;
  const paths = [
    ...site.pages.map((p) => p.slug),
    "/products",
    ...site.collections.map((c) => `/products/${c.slug}`),
    ...site.products.map((p) => `/products/${p.collection}/${p.slug}`),
  ];
  // The image library = uploads + images the site already uses (e.g. from the original import).
  const used = new Map<string, MediaItem>();
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const o = v as Record<string, unknown>;
    if (typeof o.src === "string" && typeof o.alt === "string" && !used.has(o.src))
      used.set(o.src, { url: o.src, alt: o.alt, width: (o.width as number) ?? null, height: (o.height as number) ?? null });
    Object.values(o).forEach(visit);
  };
  visit(site);
  const media: MediaItem[] = [
    ...uploads.map((m) => ({ url: m.url, alt: m.alt, width: m.width, height: m.height })),
    ...[...used.values()].filter((m) => !uploads.some((u) => u.url === m.url)),
  ];
  return {
    sitePaths: [...new Set(paths)],
    options: {
      collections: site.collections.map((c) => ({ value: c.slug, label: c.name })),
      products: site.products.map((p) => ({ value: p.slug, label: p.name })),
      services: site.services.map((s) => ({ value: s.slug, label: s.name })),
    },
    media,
  };
}
