import type { Block } from "@/schema/blocks";
import type { Collection, Product, Site } from "@/schema/site";

/**
 * Turns a category or product record into a list of ordinary blocks, following the
 * slot order in site.templates. Category and product pages therefore use exactly the
 * same block components and SEO rules as hand-built pages.
 */
export function collectionBlocks(site: Site, c: Collection): Block[] {
  const { quote, sample } = site.defaultCtas;
  const out: Block[] = [];
  for (const slot of site.templates.collection) {
    switch (slot) {
      case "hero":
        out.push({
          id: "hero", type: "hero", variant: "split", eyebrow: site.services.find((s) => s.slug === c.service)?.name,
          headline: c.name, image: c.image,
          subhead: site.templates.collectionSubhead.replace("{count}", String(site.products.filter((p) => p.collection === c.slug).length)),
          // Guided path + self-serve path side by side (the best idea on the reference site).
          primaryCta: quote, secondaryCta: sample,
        });
        break;
      case "intro":
        out.push({ id: "intro", type: "rich_text", body: c.intro, width: "narrow", background: "surface" });
        break;
      case "products":
        out.push({ id: "products", type: "product_grid", heading: "Products in this range", source: { kind: "collection", collection: c.slug }, limit: 48 });
        break;
      case "faq":
        if (c.faq?.length) out.push({ id: "faq", type: "faq", heading: `${c.shortName} FAQ`, groups: [{ items: c.faq }] });
        break;
      case "seo_body":
        if (c.seoBody) out.push({ id: "more", type: "rich_text", heading: `About private label ${c.shortName.toLowerCase()}`, body: c.seoBody, width: "narrow", background: "alt" });
        break;
      case "cta":
        out.push({ id: "cta", type: "cta_band", headline: site.templates.collectionCta.headline, body: site.templates.collectionCta.body, primary: quote, secondary: sample });
        break;
    }
  }
  return out;
}

export function productBlocks(site: Site, p: Product, c: Collection): Block[] {
  const out: Block[] = [];
  for (const slot of site.templates.product) {
    if (slot === "detail") out.push({ id: "detail", type: "product_detail", showSpecSheet: true });
    if (slot === "related")
      out.push({ id: "related", type: "product_grid", heading: `More ${c.shortName.toLowerCase()}`, source: { kind: "related" }, limit: 4, viewAll: { label: `All ${c.shortName.toLowerCase()}`, href: `/products/${c.slug}` } });
    if (slot === "cta")
      out.push({ id: "cta", type: "cta_band", headline: `Make ${p.name} your own`, body: "Request pricing for bulk or filled units, or start with a sample.", primary: { label: "Request a Quote", href: `/contact?product=${p.slug}` }, secondary: { label: "Order a Sample", href: `/request-samples?product=${p.slug}` } });
  }
  return out;
}
