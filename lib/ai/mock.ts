/**
 * Deterministic stand-in for the language model (AI_PROVIDER=mock).
 * Builds schema-valid answers from the company's own facts only, with plain template wording.
 * It exists so the whole generation pipeline can be tested without network access or API cost;
 * real copy comes from the model provider.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type S = Record<string, any>;
type Facts = {
  brand?: string; legalName?: string; city?: string; state?: string; industry?: string; whatYouMake?: string;
  services?: { name: string; description: string }[]; audience?: string; certifications?: string[];
  minimumOrder?: string; leadTime?: string; capacity?: string; differentiators?: string[]; keywords?: string[];
  foundedYear?: number; collections?: { name: string; shortName: string }[]; products?: string[];
  page?: { name: string; purpose: string; slug: string }; collection?: { name: string; shortName: string; products: string[]; details?: string[] };
  usedTitles?: string[];
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fit = (s: string, max?: number, min = 1) => {
  let t = s.replace(/\s+/g, " ").trim();
  if (max && t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, "").replace(/[,;:\-–]$/, "");
  if (t.length < min) t = t.padEnd(min, ".");
  return t;
};
const sentences = (s = "") => s.match(/[^.!?]+[.!?]/g)?.map((x) => x.trim()) ?? (s ? [s] : []);

function textFor(key: string, parent: string, i: number, f: Facts, task: string, max?: number, min?: number): string {
  const brand = f.brand ?? "Our company";
  const place = [f.city, f.state].filter(Boolean).join(", ");
  const svc = f.services ?? [];
  const page = f.page;
  const facts = [
    f.minimumOrder && `Minimum order: ${f.minimumOrder}.`,
    f.leadTime && `Typical lead time: ${f.leadTime}.`,
    f.capacity && `Capacity: ${f.capacity}.`,
    f.certifications?.length && `Certifications: ${f.certifications.join(", ")}.`,
  ].filter(Boolean) as string[];
  const about = [...sentences(f.whatYouMake), ...facts].join(" ");
  const pick = <T,>(arr: T[], d: T) => (arr.length ? arr[i % arr.length] : d);

  // ----- category intros and SEO fields
  if (task === "category_intro" && key === "intro") {
    const c = f.collection!;
    const details = (c.details ?? []).join(" ");
    return fit([
      `${c.name} from ${brand}, made for ${f.audience ?? "brands and distributors"}.`,
      `This range has ${c.products.length} products: ${c.products.join(", ")}.`,
      details,
      f.minimumOrder && `Orders start at ${f.minimumOrder} for each ${c.shortName.toLowerCase()} item.`,
      f.leadTime && `Typical lead time for this range is ${f.leadTime}.`,
      `Ask for samples of the ${c.shortName.toLowerCase()} you want to compare, then request a quote.`,
    ].filter(Boolean).join(" "), max, min);
  }
  if (task === "seo") {
    const name = page?.name ?? brand;
    if (key === "title") return fit(page?.slug === "/" ? `${cap(f.industry ?? name)} in ${f.city ?? ""}, ${f.state ?? ""} | ${brand}` : `${name} | ${brand}`, max);
    if (key === "description")
      // Whole sentences only: add each while it still fits.
      return fit([`${name} — ${brand}${place ? `, ${place}` : ""}.`, `${cap(f.industry ?? "manufacturing")} for ${f.audience ?? "businesses"}.`,
        f.minimumOrder ? `Minimums from ${f.minimumOrder}.` : "", "Request a quote."].filter(Boolean)
        .reduce((acc, x) => (!max || (acc + " " + x).trim().length <= max ? (acc + " " + x).trim() : acc), ""), max, min);
  }

  switch (key) {
    case "headline":
    case "heading":
    case "title": {
      if (parent === "cards") return fit(pick(svc.map((s) => s.name), "Our services"), max);
      if (parent === "steps") return fit(["Tell us what you need", "Samples and a quote", "Production", "Delivery"][i % 4], max);
      if (parent === "items" && task.endsWith("trust_badges")) {
        const all = [...(f.certifications ?? []), ...(f.differentiators ?? [])];
        const short = all.filter((x) => !max || x.length <= max);
        return fit(pick(short.length >= 3 ? short : all, brand), max);
      }
      if (parent === "slides") return fit(pick(svc.map((s) => s.name), brand), max);
      if (task.endsWith("faq")) return fit("Frequently asked questions", max);
      if (task.endsWith("cta_band")) return fit("Tell us what you need", max);
      if (task.endsWith("process_steps")) return fit(`How working with ${brand} works`, max);
      if (task.endsWith("hero")) return fit(page?.slug === "/" ? cap(f.industry ?? brand) + (place ? ` in ${place}` : "") : page?.name ?? brand, max);
      if (task.endsWith("service_cards")) return fit(`What ${brand} does`, max);
      return fit(page?.name ?? brand, max);
    }
    case "eyebrow":
      return fit(f.foundedYear ? `${brand} · since ${f.foundedYear}` : brand, max);
    case "subhead":
    case "intro":
      return fit(sentences(f.whatYouMake)[0] ?? `${brand} serves ${f.audience}.`, max, min);
    case "body":
    case "description":
      if (parent === "cards" || parent === "steps") {
        if (parent === "steps") return fit(["Share your product, quantities and timeline.", "We send samples and a written quote.", "We produce, pack and label your order.", "Your order ships to you or your warehouse."][i % 4], max);
        return fit(pick(svc.map((s) => s.description), about), max, min);
      }
      if (task.endsWith("thank_you")) return fit(`A member of our team will reply within one business day. You can also call us.`, max, min);
      return fit(about || `${brand} serves ${f.audience}.`, max, min);
    case "question":
      return fit(["What is your minimum order?", "How long does production take?", "Who do you work with?", "Which certifications do you hold?"][i % 4], max);
    case "answer":
      return fit([f.minimumOrder ? `Our minimum order is ${f.minimumOrder}.` : "Minimums depend on the product; ask us for a quote.", f.leadTime ? `Typical lead time is ${f.leadTime}.` : "Lead times depend on the order; we confirm them with your quote.", `We work with ${f.audience ?? "businesses of all sizes"}.`, f.certifications?.length ? `We hold: ${f.certifications.join(", ")}.` : "Ask us for our current documentation."][i % 4], max, min);
    case "detail":
      return fit(place ? `${brand}, ${place}` : brand, max);
    case "label":
      return fit(parent === "secondaryCta" || parent === "secondary" ? "Contact us" : "Request a Quote", max);
    case "href":
      return "/contact";
    case "value":
      return fit(i === 0 && f.foundedYear ? String(f.foundedYear) : "1", max);
    case "unit":
      return fit("", max, 0) || "x";
    case "blurb":
      return fit(`${brand}: ${f.industry ?? ""} for ${f.audience ?? "businesses"}${place ? `, based in ${place}` : ""}.`, max, min);
    case "text":
      return fit(sentences(f.whatYouMake)[0] ?? brand, max, min);
    case "consentText":
      return fit(`I agree to receive marketing emails from ${brand}. Unsubscribe anytime.`, max, min);
    case "submitLabel":
      return fit("Send Request", max);
    case "alt":
      return fit(`${brand} ${f.industry ?? ""}`.trim(), max);
    default:
      return fit(about.split(" ").slice(0, 8).join(" ") || brand, max, min);
  }
}

function resolve(s: S, root: S): S {
  if (s?.$ref) {
    let t: any = root;
    for (const part of String(s.$ref).replace(/^#\//, "").split("/")) t = t?.[part];
    return { ...t, ...s, $ref: undefined };
  }
  return s;
}

export function mockGenerate(schema: S, facts: Facts, task: string): unknown {
  const root = schema;
  const walk = (s0: S, key: string, parent: string, i: number): any => {
    const s = resolve(s0, root);
    if (s.const !== undefined) return s.const;
    if (s.default !== undefined && s.type !== "array" && s.type !== "object") return s.default;
    if (s.oneOf || s.anyOf) return walk((s.oneOf ?? s.anyOf)[0], key, parent, i);
    if (s.enum) return s.enum[i % s.enum.length];
    switch (s.type) {
      case "object": {
        const o: S = {};
        for (const [k, v] of Object.entries<S>(s.properties ?? {})) {
          const req = (s.required ?? []).includes(k);
          const r = resolve(v, root);
          // Optional extras are left out unless they carry useful text (keeps the stand-in plain).
          if (!req && !["subhead", "eyebrow", "intro", "primaryCta", "heading"].includes(k)) continue;
          if (!req && r.type === "object" && k !== "primaryCta") continue;
          o[k] = walk(v, k, key, i);
        }
        return o;
      }
      case "array": {
        if (s.prefixItems) return s.prefixItems.map((x: S, j: number) => walk(x, key, key, j));
        const want = key === "groups" ? 1 : key === "items" && task.endsWith("faq") ? 4 : key === "cards" ? (facts.services?.length ?? 3) : 3;
        const n = Math.max(s.minItems ?? 0, Math.min(s.maxItems ?? 3, want));
        return Array.from({ length: n }, (_, j) => walk(s.items, key, key, j));
      }
      case "string":
        return textFor(key, parent, i, facts, task, s.maxLength, s.minLength);
      case "integer":
      case "number":
        return s.minimum ?? 1;
      case "boolean":
        return false;
      default:
        return null;
    }
  };
  return walk(schema, "", "", 0);
}
