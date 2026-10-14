import type { BlockOf } from "@/schema/blocks";
import { InquiryFormClient } from "./InquiryForm";
import { Heading, type BlockCtx } from "./shared";

export function InquiryBlock({ b, ctx }: { b: BlockOf<"inquiry_form">; ctx: BlockCtx }) {
  const products = ctx.site.products.map((p) => ({
    slug: p.slug,
    name: p.name,
    category: ctx.site.collections.find((c) => c.slug === p.collection)?.shortName ?? "",
  }));
  return (
    <section className="section" id={b.id}>
      <div className="container narrow">
        <Heading primary={ctx.primary} className="section-title">{b.heading}</Heading>
        {b.intro && <p className="lead">{b.intro}</p>}
        <InquiryFormClient form={b.form} submitLabel={b.submitLabel} products={products} demo={false} />
      </div>
    </section>
  );
}
