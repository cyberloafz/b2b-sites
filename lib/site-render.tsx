import type { Metadata } from "next";
import type { Collection, Page, Product, Site } from "@/schema/site";
import { collectionMetadata, pageMetadata, productLd, productMetadata, type Crumb } from "@/lib/seo";
import { collectionBlocks, productBlocks } from "@/lib/dynamic-pages";
import { RenderBlocks } from "@/components/RenderBlocks";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";

/**
 * One router for every site and for the editor preview:
 *   /                          fixed page "/"
 *   /about, /services/x …      fixed pages by slug
 *   /products/<category>       generated category page
 *   /products/<category>/<p>   generated product page
 */
export type Route =
  | { kind: "page"; page: Page }
  | { kind: "collection"; collection: Collection }
  | { kind: "product"; product: Product; collection: Collection };

export function resolveRoute(site: Site, segments: string[] = []): Route | null {
  const path = "/" + segments.map(decodeURIComponent).join("/");
  const page = site.pages.find((p) => p.slug === path);
  if (page) return { kind: "page", page };
  if (segments[0] === "products" && segments.length === 2) {
    const c = site.collections.find((x) => x.slug === segments[1]);
    if (c) return { kind: "collection", collection: c };
  }
  if (segments[0] === "products" && segments.length === 3) {
    const c = site.collections.find((x) => x.slug === segments[1]);
    const p = site.products.find((x) => x.slug === segments[2] && x.collection === segments[1]);
    if (c && p) return { kind: "product", product: p, collection: c };
  }
  return null;
}

export function routeMetadata(site: Site, r: Route): Metadata {
  if (r.kind === "page") return pageMetadata(site, r.page);
  if (r.kind === "collection") return collectionMetadata(site, r.collection);
  return productMetadata(site, r.product, r.collection);
}

export function RouteView({ site, route }: { site: Site; route: Route }) {
  if (route.kind === "page") {
    const { page } = route;
    const crumbs: Crumb[] = [{ name: "Home", path: "/" }];
    if (page.slug.startsWith("/services/")) {
      const first = site.pages.find((p) => p.slug.startsWith("/services/"));
      if (first) crumbs.push({ name: "Services", path: first.slug });
    }
    if (page.slug !== "/") crumbs.push({ name: page.name, path: page.slug });
    return (
      <>
        {page.slug !== "/" && <Breadcrumbs site={site} crumbs={crumbs} />}
        <RenderBlocks blocks={page.sections} site={site} />
      </>
    );
  }
  if (route.kind === "collection") {
    const c = route.collection;
    return (
      <>
        <Breadcrumbs site={site} crumbs={[{ name: "Home", path: "/" }, { name: "Products", path: "/products" }, { name: c.shortName, path: `/products/${c.slug}` }]} />
        <RenderBlocks blocks={collectionBlocks(site, c)} site={site} collection={c} />
      </>
    );
  }
  const { product: p, collection: c } = route;
  return (
    <>
      <Breadcrumbs
        site={site}
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Products", path: "/products" },
          { name: c.shortName, path: `/products/${c.slug}` },
          { name: p.name, path: `/products/${c.slug}/${p.slug}` },
        ]}
      />
      <RenderBlocks blocks={productBlocks(site, p, c)} site={site} collection={c} product={p} />
      <JsonLd data={productLd(site, p, c)} />
    </>
  );
}
