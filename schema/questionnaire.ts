import { z } from "zod";
import { BLOCKS, H1_CAPABLE, type BlockType } from "./blocks";

/**
 * Input to AI generation: what the company tells us. Only these facts may appear on the site —
 * the AI is not allowed to invent certifications, numbers, clients or testimonials.
 */
export const QuestionnaireSchema = z.object({
  legalName: z.string().trim().min(2).max(80),
  brandName: z.string().trim().min(2).max(40),
  websiteUrl: z.string().trim().url("Enter the full address, e.g. https://www.example.com").regex(/^https:\/\//, "Use https://"),
  foundedYear: z.coerce.number().int().min(1800).max(2100).optional(),
  street: z.string().trim().min(3).max(80),
  city: z.string().trim().min(2).max(40),
  state: z.string().trim().regex(/^[A-Za-z]{2}$/, "2-letter state code").transform((s) => s.toUpperCase()),
  zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "5-digit ZIP code"),
  phone: z.string().trim().regex(/^\+?1?[\s.(-]*\d{3}[\s.)-]*\d{3}[\s.-]*\d{4}$/, "US phone number, e.g. (402) 555-0187"),
  email: z.string().trim().email(),
  inquiryEmail: z.string().trim().email(),
  industry: z.string().trim().min(3).max(60).describe("e.g. skincare contract manufacturing, food co-packing"),
  whatYouMake: z.string().trim().min(40, "Two or three sentences, please").max(800),
  services: z.array(z.object({ name: z.string().trim().min(2).max(40), description: z.string().trim().min(10).max(300) })).min(1).max(4),
  audience: z.string().trim().min(5).max(200).describe("Who buys from you"),
  certifications: z.array(z.string().trim().min(2).max(60)).max(8).default([]),
  minimumOrder: z.string().trim().max(80).optional(),
  leadTime: z.string().trim().max(80).optional(),
  capacity: z.string().trim().max(120).optional(),
  differentiators: z.array(z.string().trim().min(3).max(120)).max(6).default([]),
  keywords: z.array(z.string().trim().min(2).max(60)).max(10).default([]),
  testimonials: z.array(z.object({ quote: z.string().trim().min(10).max(300), name: z.string().trim().min(2).max(40), company: z.string().trim().max(60).optional() })).max(6).default([]),
  tone: z.enum(["plain-spoken", "premium", "technical"]).default("plain-spoken"),
  stylePack: z.enum(["auto", "natural-organic", "industrial-solid", "clinical-clean", "modern-tech"]).default("auto"),
});
export type Questionnaire = z.infer<typeof QuestionnaireSchema>;

/** Output of the planning step: pages and the block types on each, plus categories. */
export const PlanSchema = z.object({
  pages: z
    .array(
      z.object({
        slug: z.string().regex(/^\/([a-z0-9-]+(\/[a-z0-9-]+)*)?$/),
        name: z.string().min(2).max(60),
        template: z.enum(["home", "service", "how_it_works", "products_index", "about", "contact", "faq", "thank_you", "legal", "generic"]),
        purpose: z.string().max(200).describe("One line: what this page must achieve"),
        blocks: z.array(z.enum(Object.keys(BLOCKS) as [BlockType, ...BlockType[]])).min(1).max(14),
      })
    )
    .min(4)
    .max(20),
  collections: z.array(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(2).max(60), shortName: z.string().min(2).max(30), service: z.string() })).max(30),
});
export type Plan = z.infer<typeof PlanSchema>;

/** Rules the plan must follow no matter what the model returned. Applied in code, not trusted to the model. */
export function enforcePlanRules(plan: Plan, q: Questionnaire, serviceSlugs: string[]): Plan {
  const banned: BlockType[] = ["announcement_bar", "header", "footer", "product_detail"];
  const pages = plan.pages.map((p) => {
    let blocks = p.blocks.filter((b) => !banned.includes(b));
    if (!q.testimonials.length) blocks = blocks.filter((b) => b !== "testimonials");
    // Need verified data the questionnaire does not collect: added by hand (or by code for stats).
    blocks = blocks.filter((b) => b !== "logo_wall" && b !== "promo_slider" && b !== "stats");
    if (q.services.length < 2) blocks = blocks.filter((b) => b !== "service_cards"); // needs 2+ cards
    if (!q.certifications.length && !q.differentiators.length) blocks = blocks.filter((b) => b !== "trust_badges");
    if (!blocks.length || !H1_CAPABLE.includes(blocks[0])) blocks = [p.template === "contact" ? "inquiry_form" : "hero", ...blocks.filter((b) => b !== "hero")];
    return { ...p, blocks: [...new Set(blocks)] as BlockType[] };
  });
  // Pages every inquiry site needs.
  const must: Plan["pages"] = [
    { slug: "/", name: "Home", template: "home", purpose: "Explain what the company makes and start inquiries", blocks: ["hero", "service_cards", "category_tiles", "product_grid", "faq", "cta_band"] },
    { slug: "/contact", name: "Contact", template: "contact", purpose: "Collect quote requests", blocks: ["inquiry_form", "contact_info"] },
    { slug: "/thank-you", name: "Thank You", template: "thank_you", purpose: "Confirm the request was received", blocks: ["rich_text"] },
    { slug: "/privacy", name: "Privacy Policy", template: "legal", purpose: "Privacy policy", blocks: ["rich_text"] },
    { slug: "/terms", name: "Terms", template: "legal", purpose: "Terms of use", blocks: ["rich_text"] },
    { slug: "/accessibility", name: "Accessibility", template: "legal", purpose: "Accessibility statement", blocks: ["rich_text"] },
  ];
  for (const m of must) if (!pages.some((p) => p.slug === m.slug)) pages.push(m);
  const collections = plan.collections
    .filter((c, i, all) => all.findIndex((x) => x.slug === c.slug) === i)
    .map((c) => ({ ...c, service: serviceSlugs.includes(c.service) ? c.service : serviceSlugs[0] }));
  for (const p of pages) {
    if (collections.length < 2) p.blocks = p.blocks.filter((b) => b !== "category_tiles"); // tiles need 2+
    if (!collections.length) p.blocks = p.blocks.filter((b) => b !== "product_grid");
  }
  // The products index only makes sense with products.
  const kept = pages.filter((p) => collections.length || p.template !== "products_index");
  return { pages: kept.filter((p, i, all) => all.findIndex((x) => x.slug === p.slug) === i), collections };
}
