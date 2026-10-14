import type { Block } from "@/schema/blocks";
import { H1_CAPABLE } from "@/schema/blocks";
import type { Collection, Product, Site } from "@/schema/site";
import { CtaBand, Hero, ImageText, LogoWall, ProcessSteps, PromoSlider, ServiceCards, Stats, Testimonials, TrustBadges } from "./blocks/marketing";
import { CategoryTiles, ProductDetail, ProductGrid } from "./blocks/catalog";
import { ContactInfo, Faq, RichText } from "./blocks/content";
import { InquiryBlock } from "./blocks/Inquiry";
import type { BlockCtx } from "./blocks/shared";

/* eslint-disable @typescript-eslint/no-explicit-any */
const REGISTRY: Partial<Record<Block["type"], (p: { b: any; ctx: BlockCtx }) => React.ReactNode>> = {
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
  inquiry_form: InquiryBlock,
  product_detail: ProductDetail,
  contact_info: ContactInfo,
  // announcement_bar, header and footer render in the layout, once per site.
};

/**
 * The renderer. It alone decides which block carries the page's single H1:
 * the first block whose type can carry one. Every other block title becomes H2.
 */
export function RenderBlocks({ blocks, site, collection, product }: { blocks: Block[]; site: Site; collection?: Collection; product?: Product }) {
  const primaryIndex = blocks.findIndex((b) => H1_CAPABLE.includes(b.type) && hasTitle(b));
  return (
    <>
      {blocks.map((b, index) => {
        const C = REGISTRY[b.type];
        if (!C) return null;
        return (
          <div key={b.id} id={`blk-${b.id}`} className="blk">
            <C b={b} ctx={{ site, collection, product, index, primary: index === primaryIndex }} />
          </div>
        );
      })}
    </>
  );
}

function hasTitle(b: Block) {
  if (b.type === "rich_text") return !!b.heading;
  return true;
}
