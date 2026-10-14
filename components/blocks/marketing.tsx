import type { BlockOf } from "@/schema/blocks";
import { Icon } from "@/components/Icon";
import { Btn, Heading, Img, Sub, type BlockCtx } from "./shared";

export function Hero({ b, ctx }: { b: BlockOf<"hero">; ctx: BlockCtx }) {
  const actions = (b.primaryCta || b.secondaryCta) && (
    <div className="actions">
      {b.primaryCta && <Btn link={b.primaryCta} />}
      {b.secondaryCta && <Btn link={b.secondaryCta} variant={b.variant === "brand" ? "ghost" : "secondary"} />}
    </div>
  );
  if (b.variant === "split" && b.image) {
    return (
      <section className="hero hero-split">
        <div className="container split">
          <div>
            {b.eyebrow && <p className="eyebrow">{b.eyebrow}</p>}
            <Heading primary={ctx.primary} className="display">{b.headline}</Heading>
            {b.subhead && <p className="lead">{b.subhead}</p>}
            {actions}
          </div>
          <Img image={b.image} eager={ctx.index < 2} className="hero-img" />
        </div>
      </section>
    );
  }
  return (
    <section className={`hero hero-${b.variant}`}>
      <div className="container narrow center">
        {b.eyebrow && <p className="eyebrow">{b.eyebrow}</p>}
        <Heading primary={ctx.primary} className="display">{b.headline}</Heading>
        {b.subhead && <p className="lead">{b.subhead}</p>}
        {actions}
      </div>
    </section>
  );
}

export function TrustBadges({ b }: { b: BlockOf<"trust_badges">; ctx: BlockCtx }) {
  return (
    <section className="badges" aria-label="Certifications and highlights">
      <ul className="container badge-row">
        {b.items.map((i) => (
          <li key={i.title} className="badge">
            <span className="badge-icon"><Icon name={i.icon} /></span>
            <span>
              <strong>{i.title}</strong>
              {i.detail && <span className="muted small">{i.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ServiceCards({ b, ctx }: { b: BlockOf<"service_cards">; ctx: BlockCtx }) {
  return (
    <section className="section">
      <div className="container">
        {b.heading && <Heading primary={ctx.primary} className="section-title">{b.heading}</Heading>}
        {b.intro && <p className="section-intro">{b.intro}</p>}
        <div className={`grid cols-${b.cards.length}`}>
          {b.cards.map((c) => (
            <article key={c.title} className="card">
              {c.image && <Img image={c.image} className="card-img" />}
              <div className="card-body">
                <Sub primary={ctx.primary}>{c.title}</Sub>
                <p>{c.body}</p>
                <Btn link={c.link} variant="secondary" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PromoSlider({ b, ctx }: { b: BlockOf<"promo_slider">; ctx: BlockCtx }) {
  // Rendered as a scroll-snap row: no JavaScript, every slide is crawlable and keyboard reachable.
  return (
    <section className="section alt" aria-label="Announcements">
      <div className="container promo-row">
        {b.slides.map((s) => (
          <article key={s.title} className="promo">
            {s.image && <Img image={s.image} />}
            <Sub primary={ctx.primary}>{s.title}</Sub>
            {s.body && <p>{s.body}</p>}
            {s.link && <Btn link={s.link} variant="secondary" />}
          </article>
        ))}
      </div>
    </section>
  );
}

export function ImageText({ b, ctx }: { b: BlockOf<"image_text">; ctx: BlockCtx }) {
  return (
    <section className="section">
      <div className={`container split ${b.imageSide === "left" ? "img-left" : ""}`}>
        <div>
          <Heading primary={ctx.primary} className="section-title">{b.heading}</Heading>
          <p>{b.body}</p>
          {b.bullets && (
            <ul className="checks">
              {b.bullets.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}
          {b.cta && <Btn link={b.cta} variant="secondary" />}
        </div>
        <Img image={b.image} className="rounded" eager={ctx.index < 2} />
      </div>
    </section>
  );
}

export function ProcessSteps({ b, ctx }: { b: BlockOf<"process_steps">; ctx: BlockCtx }) {
  return (
    <section className="section alt">
      <div className="container">
        <Heading primary={ctx.primary} className="section-title">{b.heading}</Heading>
        {b.intro && <p className="section-intro">{b.intro}</p>}
        <ol className={`steps cols-${Math.min(b.steps.length, 3)}`}>
          {b.steps.map((s, i) => (
            <li key={s.title} className="step">
              <span className="step-num" aria-hidden="true">{i + 1}</span>
              <Sub primary={ctx.primary}>{s.title}</Sub>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Stats({ b, ctx }: { b: BlockOf<"stats">; ctx: BlockCtx }) {
  return (
    <section className="section stats-band">
      <div className="container">
        {b.heading && <Heading primary={ctx.primary} className="section-title center">{b.heading}</Heading>}
        <dl className={`stats cols-${b.items.length}`}>
          {b.items.map((s) => (
            <div key={s.label} className="stat">
              <dt>{s.label}</dt>
              <dd>
                {s.value}
                {s.unit && <span className="unit"> {s.unit}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function Testimonials({ b, ctx }: { b: BlockOf<"testimonials">; ctx: BlockCtx }) {
  return (
    <section className="section">
      <div className="container">
        {b.heading && <Heading primary={ctx.primary} className="section-title">{b.heading}</Heading>}
        <div className={`grid cols-${Math.min(b.items.length, 3)}`}>
          {b.items.map((t) => (
            <figure key={t.name + t.quote.slice(0, 20)} className="quote">
              <blockquote>{t.quote}</blockquote>
              <figcaption>
                <strong>{t.name}</strong>
                {(t.role || t.company) && <span className="muted"> · {[t.role, t.company].filter(Boolean).join(", ")}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LogoWall({ b, ctx }: { b: BlockOf<"logo_wall">; ctx: BlockCtx }) {
  return (
    <section className="section">
      <div className="container">
        {b.heading && <Heading primary={ctx.primary} className="section-title center">{b.heading}</Heading>}
        <ul className="logo-wall">
          {b.logos.map((l) => (
            <li key={l.src}><Img image={l} /></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function CtaBand({ b, ctx }: { b: BlockOf<"cta_band">; ctx: BlockCtx }) {
  return (
    <section className="cta-band">
      <div className="container narrow center">
        <Heading primary={ctx.primary} className="section-title">{b.headline}</Heading>
        {b.body && <p className="lead">{b.body}</p>}
        <div className="actions">
          <Btn link={b.primary} />
          {b.secondary && <Btn link={b.secondary} variant="ghost" />}
        </div>
      </div>
    </section>
  );
}
