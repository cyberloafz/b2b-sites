import { z } from "zod";

/**
 * Layer 2 + 4 — the block library and each block's content fields.
 *
 * Rules that apply to every block:
 * - Character limits are hard limits for the AI. Over the limit = rewrite, never truncate.
 * - Headings: the renderer decides the level (exactly one H1 per page). Blocks never choose
 *   their own heading level, so neither the AI nor the user can break the hierarchy.
 * - Facts (certifications, numbers, client names, testimonials) must come from the
 *   company's own materials. When missing, the AI leaves the block out or uses a
 *   `[[TODO: ...]]` placeholder that blocks publishing.
 */

// ---------- shared field types ----------

export const text = (max: number, min = 1) => z.string().min(min).max(max);

export const LinkSchema = z.object({
  label: text(30),
  href: z
    .string()
    .regex(/^(\/[a-z0-9\-\/#?=&]*|#[a-z0-9-]+|https?:\/\/\S+|mailto:\S+|tel:\S+)$/i, "Use a site path like /contact, an anchor like #form, or a full URL"),
});

export const ImageSchema = z.object({
  src: z.string().min(1),
  alt: text(125).describe("Required. Describe what is in the image; never 'image' or the file name"),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const IconName = z
  .enum([
    "leaf", "shield", "flask", "factory", "flag", "box", "truck", "badge", "clock", "drop", "star", "users",
    "beaker", "certificate", "handshake", "recycle", "chat", "document",
  ])
  .describe("Icon from the platform icon set");

const base = { id: z.string().min(1).describe("Stable id, unique within the page") };

// ---------- the 20 blocks ----------

export const AnnouncementBar = z.object({
  ...base,
  type: z.literal("announcement_bar"),
  messages: z.array(z.object({ text: text(90), link: LinkSchema.optional() })).min(1).max(3),
});

export const NavItem: z.ZodType<{ label: string; href: string; children?: unknown[] }> = z.lazy(() =>
  z.object({ label: text(30), href: z.string(), children: z.array(NavItem).max(24).optional() })
);

export const Header = z.object({
  ...base,
  type: z.literal("header"),
  logo: ImageSchema,
  logoText: text(40).optional().describe("Shown next to the logo mark if set"),
  nav: z.array(NavItem).min(2).max(7).describe("Top-level items; up to 3 levels deep"),
  cta: LinkSchema.describe("Always-visible inquiry button, e.g. 'Request a Quote'"),
});

export const Hero = z.object({
  ...base,
  type: z.literal("hero"),
  variant: z.enum(["brand", "split", "compact"]).default("brand"),
  eyebrow: text(40).optional(),
  headline: text(70),
  subhead: text(160).optional(),
  primaryCta: LinkSchema.optional(),
  secondaryCta: LinkSchema.optional(),
  image: ImageSchema.optional().describe("Used by the split variant"),
});

export const TrustBadges = z.object({
  ...base,
  type: z.literal("trust_badges"),
  items: z
    .array(z.object({ icon: IconName, title: text(24), detail: text(40).optional() }))
    .min(3)
    .max(6)
    .describe("Only claims backed by the company's documents"),
});

export const ServiceCards = z.object({
  ...base,
  type: z.literal("service_cards"),
  heading: text(70).optional(),
  intro: text(220).optional(),
  cards: z
    .array(z.object({ title: text(40), body: text(220), image: ImageSchema.optional(), link: LinkSchema }))
    .min(2)
    .max(4),
});

export const PromoSlider = z.object({
  ...base,
  type: z.literal("promo_slider"),
  slides: z
    .array(z.object({ title: text(60), body: text(180).optional(), image: ImageSchema.optional(), link: LinkSchema.optional() }))
    .min(1)
    .max(3),
});

export const CategoryTiles = z.object({
  ...base,
  type: z.literal("category_tiles"),
  heading: text(70).optional(),
  intro: text(220).optional(),
  categories: z
    .array(z.string().describe("Collection slug"))
    .min(2)
    .max(12)
    .describe("Tile image and alt come from the collection itself"),
});

export const ProductGrid = z.object({
  ...base,
  type: z.literal("product_grid"),
  heading: text(70).optional(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("collection"), collection: z.string() }),
    z.object({ kind: z.literal("manual"), products: z.array(z.string()).min(1).max(24) }),
    z.object({ kind: z.literal("featured") }),
    z.object({ kind: z.literal("related") }).describe("Product pages only: same collection, excluding itself"),
  ]),
  limit: z.number().int().min(2).max(48).default(8),
  viewAll: LinkSchema.optional(),
});

export const ImageText = z.object({
  ...base,
  type: z.literal("image_text"),
  heading: text(70),
  body: text(600),
  bullets: z.array(text(90)).max(6).optional(),
  image: ImageSchema,
  imageSide: z.enum(["left", "right"]).default("right"),
  cta: LinkSchema.optional(),
});

export const ProcessSteps = z.object({
  ...base,
  type: z.literal("process_steps"),
  heading: text(70),
  intro: text(220).optional(),
  steps: z.array(z.object({ title: text(50), body: text(200) })).min(3).max(8),
});

export const Stats = z.object({
  ...base,
  type: z.literal("stats"),
  heading: text(70).optional(),
  items: z
    .array(z.object({ value: text(10), unit: text(16).optional(), label: text(50) }))
    .min(2)
    .max(4)
    .describe("Every number must come from the company's materials"),
});

export const Testimonials = z.object({
  ...base,
  type: z.literal("testimonials"),
  heading: text(70).optional(),
  items: z
    .array(z.object({ quote: text(300), name: text(40), role: text(40).optional(), company: text(60).optional() }))
    .min(1)
    .max(6)
    .describe("Real testimonials supplied by the company only. The AI never writes these."),
});

export const LogoWall = z.object({
  ...base,
  type: z.literal("logo_wall"),
  heading: text(70).optional(),
  logos: z.array(ImageSchema).min(3).max(18),
  permissionConfirmed: z.literal(true).describe("Company confirmed it may show these logos"),
});

export const Faq = z.object({
  ...base,
  type: z.literal("faq"),
  heading: text(70).default("Frequently Asked Questions"),
  groups: z
    .array(
      z.object({
        title: text(40).optional(),
        items: z.array(z.object({ question: text(140), answer: text(600) })).min(1).max(12),
      })
    )
    .min(1)
    .max(6),
});

export const RichText = z.object({
  ...base,
  type: z.literal("rich_text"),
  heading: text(70).optional(),
  body: z
    .string()
    .min(1)
    .max(6000)
    .describe("Markdown subset: paragraphs, **bold**, lists, links, ### subheadings (never # or ##)"),
  width: z.enum(["narrow", "wide"]).default("narrow"),
  background: z.enum(["surface", "alt"]).default("surface"),
});

export const CtaBand = z.object({
  ...base,
  type: z.literal("cta_band"),
  headline: text(70),
  body: text(200).optional(),
  primary: LinkSchema.describe("Guided path, e.g. 'Request a Quote'"),
  secondary: LinkSchema.optional().describe("Self-serve path, e.g. 'Order Samples'"),
});

export const InquiryForm = z.object({
  ...base,
  type: z.literal("inquiry_form"),
  form: z.enum(["contact", "quote", "sample", "project", "spec_sheet"]),
  heading: text(70),
  intro: text(220).optional(),
  submitLabel: text(24).default("Send Request"),
});

export const ProductDetail = z.object({
  ...base,
  type: z.literal("product_detail"),
  // Content comes from the product record; this block only controls layout options.
  showSpecSheet: z.boolean().default(true),
  ctas: z.tuple([LinkSchema, LinkSchema]).optional().describe("Defaults: Request a Quote / Order a Sample"),
});

export const ContactInfo = z.object({
  ...base,
  type: z.literal("contact_info"),
  heading: text(70).optional(),
  showHours: z.boolean().default(true),
  showMap: z.boolean().default(false),
});

export const Footer = z.object({
  ...base,
  type: z.literal("footer"),
  blurb: text(200),
  columns: z.array(z.object({ title: text(30), links: z.array(LinkSchema).min(1).max(10) })).min(1).max(4),
  newsletter: z
    .object({ enabled: z.boolean(), heading: text(50), consentText: text(200) })
    .optional()
    .describe("Separate, unticked opt-in (CAN-SPAM)"),
  legalLinks: z.array(LinkSchema).min(2).max(5),
});

// ---------- union ----------

export const BLOCKS = {
  announcement_bar: AnnouncementBar,
  header: Header,
  hero: Hero,
  trust_badges: TrustBadges,
  service_cards: ServiceCards,
  promo_slider: PromoSlider,
  category_tiles: CategoryTiles,
  product_grid: ProductGrid,
  image_text: ImageText,
  process_steps: ProcessSteps,
  stats: Stats,
  testimonials: Testimonials,
  logo_wall: LogoWall,
  faq: Faq,
  rich_text: RichText,
  cta_band: CtaBand,
  inquiry_form: InquiryForm,
  product_detail: ProductDetail,
  contact_info: ContactInfo,
  footer: Footer,
} as const;

export const BlockSchema = z.discriminatedUnion("type", [
  AnnouncementBar, Header, Hero, TrustBadges, ServiceCards, PromoSlider, CategoryTiles, ProductGrid,
  ImageText, ProcessSteps, Stats, Testimonials, LogoWall, Faq, RichText, CtaBand, InquiryForm,
  ProductDetail, ContactInfo, Footer,
]);

export type Block = z.infer<typeof BlockSchema>;
export type BlockType = Block["type"];
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

/**
 * Blocks that may carry the page's single H1, in priority order.
 * The renderer gives H1 to the first block on the page whose type is in this list.
 */
export const H1_CAPABLE: BlockType[] = ["hero", "product_detail", "rich_text", "inquiry_form", "faq", "process_steps", "image_text"];

/** Blocks that live in the site-wide header/footer groups, not on individual pages. */
export const GLOBAL_ONLY: BlockType[] = ["announcement_bar", "header", "footer"];
