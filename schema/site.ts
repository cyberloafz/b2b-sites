import { z } from "zod";
import { AnnouncementBar, BlockSchema, Footer, Header, ImageSchema, LinkSchema, text } from "./blocks";
import { ThemeSchema } from "./theme";

/** Page-level SEO fields. Empty fields are filled by the SEO engine from templates. */
export const SeoSchema = z.object({
  title: text(60).optional().describe("<title>; target 30–60 characters, unique across the site"),
  description: z.string().min(70).max(160).optional().describe("Meta description; target 140–160 characters"),
  noindex: z.boolean().default(false),
  ogImage: z.string().optional(),
});

export const CompanySchema = z.object({
  legalName: text(80),
  brandName: text(40),
  tagline: text(90),
  foundedYear: z.number().int().min(1800).max(2100).optional(),
  description: text(400).describe("Fact paragraph AI search engines can quote: who, where, what, for whom"),
  address: z.object({
    street: text(80),
    city: text(40),
    region: z.string().length(2).describe("US state code"),
    postalCode: z.string().regex(/^\d{5}(-\d{4})?$/),
    country: z.literal("US"),
  }),
  phone: z.string().regex(/^\+1[0-9]{10}$/).describe("E.164, e.g. +15035550123"),
  phoneDisplay: text(20),
  email: z.string().email(),
  inquiryRecipients: z.array(z.string().email()).min(1).max(5),
  hours: z.array(z.object({ days: text(20), open: text(10), close: text(10) })).max(7).optional(),
  certifications: z.array(text(60)).max(10).default([]),
  social: z
    .array(z.object({ network: z.enum(["linkedin", "instagram", "facebook", "youtube", "x"]), url: z.string().url() }))
    .max(5)
    .default([]),
  siteUrl: z.string().url().describe("Canonical origin, no trailing slash"),
});

export const CollectionSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: text(60),
  shortName: text(30).describe("Used on tiles and in navigation"),
  service: z.string().describe("Service slug this category belongs to"),
  intro: z.string().min(120).max(1200).describe("Unique intro; >= 120 words recommended for indexing"),
  seoBody: z.string().max(4000).optional().describe("Bottom-of-page long text (markdown subset)"),
  image: ImageSchema,
  faq: z.array(z.object({ question: text(140), answer: text(600) })).max(6).optional(),
  seo: SeoSchema.default({ noindex: false }),
});

export const ProductSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: text(70),
  collection: z.string(),
  sku: text(24).optional(),
  summary: text(160).describe("One-line pitch used on cards and as meta description seed"),
  description: z.string().min(80).max(2000),
  highlights: z.array(text(80)).min(2).max(6),
  specs: z.array(z.object({ label: text(30), value: text(80) })).max(12),
  packaging: z.array(z.object({ label: text(30), sku: text(24).optional() })).min(1).max(8),
  usage: text(600).optional(),
  composition: z
    .object({ label: z.enum(["Ingredients", "Materials", "Composition"]), text: z.string().max(1500) })
    .optional(),
  image: ImageSchema,
  specSheetUrl: z.string().optional(),
  featured: z.boolean().default(false),
  priceNote: z
    .object({ text: text(60), show: z.boolean().default(false) })
    .optional()
    .describe("Optional reference price, e.g. 'From $78 / gal'. Hidden unless show = true"),
  seo: SeoSchema.default({ noindex: false }),
});

export const PageSchema = z.object({
  slug: z
    .string()
    .regex(/^\/([a-z0-9-]+(\/[a-z0-9-]+)*)?$/)
    .describe("'/' for home, '/about', '/services/private-label'"),
  template: z.enum(["home", "service", "how_it_works", "products_index", "about", "contact", "faq", "thank_you", "legal", "generic"]),
  name: text(60).describe("Used in breadcrumbs and admin"),
  sections: z.array(BlockSchema).min(1).max(30),
  seo: SeoSchema.default({ noindex: false }),
});

/**
 * Layouts for pages generated from data (one per category, one per product).
 * Each slot is turned into a real block from the category/product record at render time,
 * so these pages use the same block components as every other page.
 */
export const DynamicTemplatesSchema = z.object({
  collection: z
    .array(z.enum(["hero", "intro", "products", "faq", "seo_body", "cta"]))
    .min(2)
    .describe("Order of sections on every category page"),
  product: z
    .array(z.enum(["detail", "related", "cta"]))
    .min(1)
    .describe("Order of sections on every product page"),
  collectionSubhead: text(160).describe("Hero subhead on every category page; {count} = number of products"),
  collectionCta: z.object({ headline: text(70), body: text(200).optional() }),
});

export const ServiceSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: text(40),
});

export const SiteSchema = z.object({
  version: z.literal(1),
  company: CompanySchema,
  theme: ThemeSchema,
  services: z.array(ServiceSchema).min(1).max(5),
  globals: z.object({
    announcement: AnnouncementBar.optional(),
    header: Header,
    footer: Footer,
  }),
  pages: z.array(PageSchema).min(1),
  collections: z.array(CollectionSchema),
  products: z.array(ProductSchema),
  templates: DynamicTemplatesSchema,
  defaultCtas: z.object({ quote: LinkSchema, sample: LinkSchema }),
});

export type Site = z.infer<typeof SiteSchema>;
export type Page = z.infer<typeof PageSchema>;
export type Collection = z.infer<typeof CollectionSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type Company = z.infer<typeof CompanySchema>;
