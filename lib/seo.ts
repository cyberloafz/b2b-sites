import type { Metadata } from "next";
import type { Collection, Page, Product, Site } from "@/schema/site";
import type { BlockOf } from "@/schema/blocks";

/**
 * Layer 5 — the SEO engine. Everything here is derived from site data by rule,
 * so every generated site gets the same baseline without anyone remembering to do it.
 */

const clip = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…");
const plain = (md: string) => md.replace(/[*_#>\[\]]|\(([^)]+)\)/g, "").replace(/\s+/g, " ").trim();
export const wordCount = (s: string) => plain(s).split(" ").filter(Boolean).length;

/** Canonical URLs always use the clean path: no query strings, so ad tracking parameters never split rankings. */
/** Images may be site paths (/images/…) or absolute storage/CDN addresses. */
export const absUrl = (site: Site, src: string) => (/^https?:\/\//.test(src) ? src : site.company.siteUrl + src);

export function canonical(site: Site, path: string) {
  const clean = path === "/" ? "/" : path.replace(/\/+$/, "");
  return site.company.siteUrl + clean;
}

function meta(site: Site, opts: { title: string; description: string; path: string; noindex?: boolean; image?: string }): Metadata {
  const url = canonical(site, opts.path);
  const image = absUrl(site, opts.image ?? "/images/og-default.svg");
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    robots: opts.noindex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { title: opts.title, description: opts.description, url, siteName: site.company.brandName, type: "website", images: [{ url: image }] },
    twitter: { card: "summary_large_image", title: opts.title, description: opts.description, images: [image] },
  };
}

// Title formulas used when the AI or the user left a field empty.
export function pageMetadata(site: Site, page: Page): Metadata {
  const fallbackTitle = `${page.name} | ${site.company.brandName}`;
  const fallbackDesc = clip(`${page.name} — ${site.company.description}`, 160);
  return meta(site, {
    title: page.seo.title ?? fallbackTitle,
    description: page.seo.description ?? fallbackDesc,
    path: page.slug,
    noindex: page.seo.noindex,
  });
}

/** Thin-content rule: a long-tail category page is indexed only with 3+ products and a 120+ word intro. */
export function collectionIndexable(site: Site, c: Collection) {
  const n = site.products.filter((p) => p.collection === c.slug).length;
  return !c.seo.noindex && n >= 3 && wordCount(c.intro) >= 120;
}

export function collectionMetadata(site: Site, c: Collection): Metadata {
  return meta(site, {
    title: c.seo.title ?? clip(`${c.name} | ${site.company.brandName}`, 60),
    description: c.seo.description ?? clip(plain(c.intro), 160),
    path: `/products/${c.slug}`,
    noindex: !collectionIndexable(site, c),
    image: c.image.src.endsWith(".svg") ? undefined : c.image.src,
  });
}

export function productMetadata(site: Site, p: Product, c: Collection): Metadata {
  return meta(site, {
    title: p.seo.title ?? clip(`${p.name} — ${c.shortName} | ${site.company.brandName}`, 60),
    description: p.seo.description ?? clip(`${p.summary} Private label, bulk or filled. ${p.highlights[0]}.`, 160),
    path: `/products/${c.slug}/${p.slug}`,
    noindex: p.seo.noindex,
  });
}

// ---------- structured data (JSON-LD) ----------

export function organizationLd(site: Site) {
  const co = site.company;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${co.siteUrl}/#organization`,
    name: co.legalName,
    alternateName: co.brandName,
    url: co.siteUrl,
    logo: absUrl(site, site.globals.header.logo.src),
    description: co.description,
    ...(co.foundedYear ? { foundingDate: String(co.foundedYear) } : {}),
    email: co.email,
    telephone: co.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: co.address.street,
      addressLocality: co.address.city,
      addressRegion: co.address.region,
      postalCode: co.address.postalCode,
      addressCountry: co.address.country,
    },
    contactPoint: [{ "@type": "ContactPoint", contactType: "sales", telephone: co.phone, email: co.email, areaServed: "US", availableLanguage: "en" }],
    // Only real, non-empty profile URLs (RSL shipped empty strings here).
    sameAs: co.social.map((s) => s.url).filter(Boolean),
  };
}

export function websiteLd(site: Site) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site.company.siteUrl}/#website`,
    name: site.company.brandName,
    url: site.company.siteUrl,
    publisher: { "@id": `${site.company.siteUrl}/#organization` },
  };
}

export type Crumb = { name: string; path: string };

export function breadcrumbLd(site: Site, crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: canonical(site, c.path) })),
  };
}

/**
 * Inquiry-only product: no `offers`, because there is no public price. Google may then
 * show no price/rating rich result — an accepted trade-off of the inquiry model.
 */
export function productLd(site: Site, p: Product, c: Collection) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.summary,
    sku: p.sku,
    category: c.name,
    image: absUrl(site, p.image.src),
    url: canonical(site, `/products/${c.slug}/${p.slug}`),
    brand: { "@type": "Brand", name: site.company.brandName },
    manufacturer: { "@id": `${site.company.siteUrl}/#organization` },
  };
}

export function faqLd(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.question, acceptedAnswer: { "@type": "Answer", text: i.answer } })),
  };
}

export const faqItems = (b: BlockOf<"faq">) => b.groups.flatMap((g) => g.items);
