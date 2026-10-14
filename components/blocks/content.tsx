import type { BlockOf } from "@/schema/blocks";
import { Markdown } from "@/lib/markdown";
import { faqItems, faqLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { Heading, Sub, subLevel, type BlockCtx } from "./shared";

export function Faq({ b, ctx }: { b: BlockOf<"faq">; ctx: BlockCtx }) {
  return (
    <section className="section">
      <div className="container narrow">
        <Heading primary={ctx.primary} className="section-title">{b.heading}</Heading>
        {b.groups.map((g, gi) => (
          <div key={gi} className="faq-group">
            {g.title && <Sub primary={ctx.primary}>{g.title}</Sub>}
            {g.items.map((i) => (
              <details key={i.question} className="faq-item">
                <summary>{i.question}</summary>
                <p>{i.answer}</p>
              </details>
            ))}
          </div>
        ))}
      </div>
      <JsonLd data={faqLd(faqItems(b))} />
    </section>
  );
}

export function RichText({ b, ctx }: { b: BlockOf<"rich_text">; ctx: BlockCtx }) {
  return (
    <section className={`section ${b.background === "alt" ? "alt" : ""}`}>
      <div className={`container prose ${b.width === "narrow" ? "narrow" : ""}`}>
        {b.heading && <Heading primary={ctx.primary} className="section-title">{b.heading}</Heading>}
        <Markdown source={b.body} subLevel={b.heading ? subLevel(ctx.primary) : ctx.primary ? 2 : 3} />
      </div>
    </section>
  );
}

export function ContactInfo({ b, ctx }: { b: BlockOf<"contact_info">; ctx: BlockCtx }) {
  const co = ctx.site.company;
  return (
    <section className="section alt">
      <div className="container">
        {b.heading && <Heading primary={ctx.primary} className="section-title">{b.heading}</Heading>}
        <div className="grid cols-3 contact-grid">
          <address>
            <strong>{co.legalName}</strong>
            <br />{co.address.street}
            <br />{co.address.city}, {co.address.region} {co.address.postalCode}
          </address>
          <p>
            <strong>Phone</strong><br /><a href={`tel:${co.phone}`}>{co.phoneDisplay}</a>
            <br /><strong>Email</strong><br /><a href={`mailto:${co.email}`}>{co.email}</a>
          </p>
          {b.showHours && co.hours && (
            <p>
              <strong>Hours (Eastern)</strong>
              {co.hours.map((h) => (
                <span key={h.days}><br />{h.days}: {h.open}–{h.close}</span>
              ))}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
