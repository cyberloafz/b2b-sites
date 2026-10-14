import type { Block, BlockType } from "@/schema/blocks";

/**
 * Starting content for a block added from the library. Every default is valid for its schema,
 * and every piece of text the user must replace is a [[TODO: …]] placeholder,
 * which blocks publishing until it is filled in.
 */
const T = (what: string) => `[[TODO: ${what}]]`;
const link = (label: string, href = "/contact") => ({ label, href });
const img = { src: "/images/lab.svg", alt: T("describe the image"), width: 720, height: 540 };

export const BLOCK_LABELS: Record<BlockType, { name: string; hint: string }> = {
  announcement_bar: { name: "Announcement bar", hint: "Short notices above the header" },
  header: { name: "Header", hint: "Logo, navigation, quote button" },
  footer: { name: "Footer", hint: "Links, sign-up, legal" },
  hero: { name: "Hero", hint: "Main headline with buttons" },
  trust_badges: { name: "Trust badges", hint: "Certifications and key facts" },
  service_cards: { name: "Service cards", hint: "2–4 ways to work with you" },
  promo_slider: { name: "Promotions", hint: "1–3 announcements side by side" },
  category_tiles: { name: "Category tiles", hint: "Links to product categories" },
  product_grid: { name: "Product grid", hint: "Featured, chosen or category products" },
  image_text: { name: "Image + text", hint: "Picture beside a paragraph" },
  process_steps: { name: "Process steps", hint: "How working together works" },
  stats: { name: "Numbers", hint: "2–4 key figures" },
  testimonials: { name: "Testimonials", hint: "Real customer quotes only" },
  logo_wall: { name: "Client logos", hint: "Logos you have permission to show" },
  faq: { name: "FAQ", hint: "Questions and answers" },
  rich_text: { name: "Text", hint: "Paragraphs, lists, subheadings" },
  cta_band: { name: "Call to action", hint: "Quote and sample buttons" },
  inquiry_form: { name: "Inquiry form", hint: "Quote, sample, project or contact" },
  product_detail: { name: "Product detail", hint: "Used on product pages" },
  contact_info: { name: "Contact details", hint: "Address, phone, hours" },
};

/** Blocks a user can add to a page (product_detail and the site-wide blocks are placed by the system). */
export const ADDABLE: BlockType[] = [
  "hero", "trust_badges", "service_cards", "category_tiles", "product_grid", "image_text", "process_steps",
  "stats", "testimonials", "logo_wall", "faq", "rich_text", "cta_band", "inquiry_form", "contact_info", "promo_slider",
];

export function defaultBlock(type: BlockType, id: string, ctx: { collections: string[] } = { collections: [] }): Block {
  const base = { id };
  switch (type) {
    case "hero": return { ...base, type, variant: "compact", headline: T("headline"), subhead: T("one sentence"), primaryCta: link("Request a Quote") };
    case "trust_badges": return { ...base, type, items: [1, 2, 3].map(() => ({ icon: "badge" as const, title: T("fact") })) };
    case "service_cards": return { ...base, type, heading: T("heading"), cards: [1, 2].map(() => ({ title: T("service"), body: T("what it is"), link: link("Learn more") })) };
    case "promo_slider": return { ...base, type, slides: [{ title: T("announcement") }] };
    case "category_tiles": return { ...base, type, heading: "Shop by category", categories: ctx.collections.slice(0, 8) };
    case "product_grid": return { ...base, type, heading: "Featured products", source: { kind: "featured" }, limit: 8 };
    case "image_text": return { ...base, type, heading: T("heading"), body: T("paragraph"), image: img, imageSide: "right" };
    case "process_steps": return { ...base, type, heading: "How it works", steps: [1, 2, 3].map((n) => ({ title: T(`step ${n}`), body: T("what happens") })) };
    case "stats": return { ...base, type, items: [1, 2].map(() => ({ value: "0", label: T("what the number means") })) };
    case "testimonials": return { ...base, type, heading: "What clients say", items: [{ quote: T("paste a real customer quote"), name: T("customer name") }] };
    case "logo_wall": return { ...base, type, heading: "Trusted by", logos: [img, img, img], permissionConfirmed: true };
    case "faq": return { ...base, type, heading: "Frequently Asked Questions", groups: [{ items: [{ question: T("question"), answer: T("answer") }] }] };
    case "rich_text": return { ...base, type, heading: T("heading"), body: T("text"), width: "narrow", background: "surface" };
    case "cta_band": return { ...base, type, headline: T("headline"), primary: link("Request a Quote"), secondary: link("Order Samples", "/request-samples") };
    case "inquiry_form": return { ...base, type, form: "quote", heading: "Request a quote", submitLabel: "Send Request" };
    case "contact_info": return { ...base, type, heading: "Contact us", showHours: true, showMap: false };
    case "product_detail": return { ...base, type, showSpecSheet: true };
    case "announcement_bar": return { ...base, type, messages: [{ text: T("notice") }] };
    default: throw new Error(`No default for ${type}`);
  }
}
