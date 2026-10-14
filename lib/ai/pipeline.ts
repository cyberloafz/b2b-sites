import { z } from "zod";
import { json, one, q, tx } from "@/db/client";
import {
  BLOCKS, CtaBand, Faq, Hero, ImageText, ProcessSteps, RichText, ServiceCards, TrustBadges, text,
  type Block, type BlockType,
} from "@/schema/blocks";
import { CollectionSchema, type Company, type Site } from "@/schema/site";
import { STYLE_PACKS, type Theme } from "@/schema/theme";
import { PlanSchema, enforcePlanRules, type Plan, type Questionnaire } from "@/schema/questionnaire";
import { validateSite } from "@/schema/validate";
import { assembleDraft, writeDraft } from "@/lib/repo/sites";
import { importProducts, type Mapping } from "@/lib/repo/import";
import { defaultBlock } from "@/lib/block-defaults";
import { generate, provider, usageScope, type Usage } from "./model";
import { loadPrompt } from "./prompts";
import { buildTheme, pickStylePack } from "./brand";
import { SAMPLE_NOTICE_TEXT } from "@/lib/legal";

/**
 * AI one-click generation. The model only ever fills JSON for a fixed schema; code decides
 * structure, links, images, navigation and anything that must be a verified fact.
 *
 *   start   questionnaire + logo + product sheet → site row, brand theme   (startSite)
 *   plan    model proposes pages/blocks/categories → rules applied in code → user confirms (planSite)
 *   build   skeleton draft → products imported → blocks, category intros and SEO written
 *           one at a time, each validated, each retryable                    (runGeneration)
 *
 * Every model call is logged in ai_jobs. Anything that fails stays a [[TODO: …]] placeholder,
 * which blocks publishing until a person fills it in, so a bad answer can never go live silently.
 */

export type SheetInput = { headers: string[]; rows: string[][]; mapping: Mapping };
export type Logo = { src: string; width: number; height: number; color: string | null };
export type GenerationRow = {
  site_id: string; questionnaire: Questionnaire; logo: Logo | null; sheet: SheetInput | null; brand_note: string | null;
  plan: Plan | null; status: "planning" | "plan_ready" | "generating" | "done" | "failed"; error: string | null;
  summary: Summary | null; provider: string | null; updated_at: string;
};
export type Summary = {
  pages: number; blocks: number; aiBlocks: number; failedJobs: number; products: { created: number; failed: { row: number; name: string; message?: string }[] };
  todos: { where: string; message: string }[]; errors: { where: string; message: string }[]; warnings: number;
};
export type JobRow = { id: number; step: string; target: string | null; status: string; error: string | null; output: unknown; created_at: string; finished_at: string | null };

// ---------- small helpers

export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
/** Shorten at a word boundary (never mid-word). */
const fit = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max + 1).replace(/\s+\S*$/, "").replace(/[,;:\-–—]$/, "");
};
const firstSentence = (s: string) => s.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? s;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const TODO = (w: string) => `[[TODO: ${w}]]`;

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => { while (queue.length) await fn(queue.shift()!); }));
}

export const serviceSlugs = (qn: Questionnaire) => {
  const seen = new Set<string>();
  return qn.services.map((s) => {
    let slug = slugify(s.name) || "service";
    for (let i = 2; seen.has(slug); i++) slug = `${slugify(s.name)}-${i}`;
    seen.add(slug);
    return slug;
  });
};

/** Categories and their product names, read straight from the sheet with the confirmed column mapping. */
export function sheetCategories(sheet: SheetInput | null): { name: string; products: string[]; details: string[]; image?: string }[] {
  if (!sheet || sheet.mapping.category === undefined || sheet.mapping.name === undefined) return [];
  const out = new Map<string, { name: string; products: string[]; details: string[]; image?: string }>();
  for (const r of sheet.rows) {
    const cat = (r[sheet.mapping.category] ?? "").trim();
    const name = (r[sheet.mapping.name] ?? "").trim();
    if (!cat || !name) continue;
    const e = out.get(cat.toLowerCase()) ?? { name: cat, products: [], details: [] };
    e.products.push(name);
    // "Name: first two sentences of its description" — real product facts for the category intro.
    const desc = sheet.mapping.description !== undefined ? (r[sheet.mapping.description] ?? "").trim() : "";
    if (desc && e.details.length < 12) e.details.push(`${name}: ${(desc.match(/[^.!?]+[.!?]/g) ?? [desc]).slice(0, 2).join(" ").trim().slice(0, 300)}`);
    const img = sheet.mapping.image !== undefined ? (r[sheet.mapping.image] ?? "").trim() : "";
    if (!e.image && /^(https:\/\/|\/)/.test(img)) e.image = img;
    out.set(cat.toLowerCase(), e);
  }
  return [...out.values()].slice(0, 30);
}

function phoneParts(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return { e164: `+1${d}`, display: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` };
}

export function companyFrom(qn: Questionnaire): Company {
  const where = `${qn.city}, ${qn.state}`;
  const ph = phoneParts(qn.phone);
  return {
    legalName: qn.legalName,
    brandName: qn.brandName,
    tagline: fit(`${cap(qn.industry)} in ${where}`, 90),
    ...(qn.foundedYear ? { foundedYear: qn.foundedYear } : {}),
    description: fit(`${qn.legalName} is a ${qn.industry} company in ${where}${qn.foundedYear ? `, founded in ${qn.foundedYear}` : ""}. ${qn.whatYouMake}`, 400),
    address: { street: qn.street, city: qn.city, region: qn.state, postalCode: qn.zip, country: "US" },
    phone: ph.e164,
    phoneDisplay: ph.display,
    email: qn.email,
    inquiryRecipients: [qn.inquiryEmail],
    certifications: qn.certifications,
    social: [],
    siteUrl: new URL(qn.websiteUrl).origin,
  };
}

/** Numbers the company actually gave us, in the shape of the stats block. Fewer than two → no stats block. */
function statsFromFacts(qn: Questionnaire, productCount: number) {
  const items: { value: string; unit?: string; label: string }[] = [];
  if (qn.foundedYear) items.push({ value: String(qn.foundedYear), label: "Year founded" });
  const num = (s: string | undefined, label: string) => {
    const m = s?.match(/^\s*([\d][\d,.–-]*\+?)\s*(.*)$/);
    if (m && m[1].length <= 10 && m[2].length <= 16) items.push({ value: m[1], ...(m[2] ? { unit: m[2] } : {}), label });
  };
  num(qn.minimumOrder, "Minimum order");
  num(qn.leadTime, "Typical lead time");
  if (productCount >= 3) items.push({ value: String(productCount), label: "Products in our catalog" });
  return items.slice(0, 4);
}

// ---------- jobs log

async function logJob<T>(siteId: string, step: string, target: string | null, input: unknown, fn: () => Promise<{ ok: boolean; output?: T; error?: string }>) {
  const row = await one<{ id: number }>("INSERT INTO ai_jobs (site_id, step, target, input, status) VALUES ($1,$2,$3,$4,'running') RETURNING id", [siteId, step, target, json(input ?? {})]);
  let res: { ok: boolean; output?: T; error?: string };
  const usage: Usage = { input: 0, output: 0, model: null };
  try { res = await usageScope.run(usage, fn); } catch (e) { res = { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  await q("UPDATE ai_jobs SET status = $1, output = $2, error = $3, finished_at = now(), input_tokens = $5, output_tokens = $6, model = $7 WHERE id = $4",
    [res.ok ? "done" : "failed", json(res.output ?? null), res.error ?? null, row!.id, usage.input, usage.output, usage.model]);
  return res;
}

export async function getGeneration(siteId: string) {
  return one<GenerationRow>("SELECT * FROM site_generations WHERE site_id = $1", [siteId]);
}
export async function listJobs(siteId: string) {
  return q<JobRow>("SELECT id, step, target, status, error, output, created_at, finished_at FROM ai_jobs WHERE site_id = $1 AND status <> 'superseded' ORDER BY id", [siteId]);
}
async function setStatus(siteId: string, status: GenerationRow["status"], extra: { error?: string | null; summary?: Summary } = {}) {
  await q("UPDATE site_generations SET status = $1, error = $2, summary = coalesce($3, summary), updated_at = now() WHERE site_id = $4",
    [status, extra.error ?? null, extra.summary ? json(extra.summary) : null, siteId]);
}

// ---------- 1. start

const RESERVED = new Set(["new", "login", "api", "admin", "preview", "media", "images", "s"]);

export async function startSite(input: { userId: number; questionnaire: Questionnaire; sheet: SheetInput | null; logo: (siteId: string) => Promise<{ ok: true; logo: Logo | null } | { ok: false; error: string }> }) {
  const qn = input.questionnaire;
  const base = slugify(qn.brandName).slice(0, 30) || "site";
  let siteId = base;
  for (let i = 2; RESERVED.has(siteId) || (await one("SELECT 1 FROM sites WHERE id = $1", [siteId])); i++) siteId = `${base}-${i}`;

  const logoRes = await input.logo(siteId);
  if (!logoRes.ok) return { ok: false as const, error: logoRes.error };
  const pack = qn.stylePack === "auto" ? pickStylePack(qn.industry, qn.whatYouMake) : qn.stylePack;
  const { theme, note } = buildTheme(pack, logoRes.logo?.color ?? null);
  const slugs = serviceSlugs(qn);

  await tx(async (t) => {
    // Placeholder globals/templates: the build step replaces the whole draft.
    await t.query(
      `INSERT INTO sites (id, name, status, company, theme, services, globals, templates, default_ctas) VALUES ($1,$2,'generating',$3,$4,$5,'{}','{}','{}')`,
      [siteId, qn.brandName, json(companyFrom(qn)), json(theme), json(qn.services.map((s, i) => ({ slug: slugs[i], name: s.name })))]
    );
    await t.query("INSERT INTO memberships (user_id, site_id, role) VALUES ($1,$2,'owner')", [input.userId, siteId]);
    // Staging address until the company connects its own domain.
    await t.query("INSERT INTO domains (hostname, site_id, is_primary, kind, verified_at, dns_ok, ssl_status) VALUES ($1,$2,false,'staging',now(),true,'active') ON CONFLICT (hostname) DO NOTHING",
      [`${siteId}.${process.env.PLATFORM_DOMAIN ?? "localhost"}`, siteId]);
    await t.query(
      "INSERT INTO site_generations (site_id, questionnaire, logo, sheet, brand_note, status, provider, created_by) VALUES ($1,$2,$3,$4,$5,'planning',$6,$7)",
      [siteId, json(qn), json(logoRes.logo), json(input.sheet), note, provider(), input.userId]
    );
  });
  await planSite(siteId);
  return { ok: true as const, siteId };
}

// ---------- 2. plan

/** The plan used when the model is not available or its answer is unusable; also the mock answer. */
export function defaultPlan(qn: Questionnaire, cats: { name: string }[]): Plan {
  const slugs = serviceSlugs(qn);
  const pages: Plan["pages"] = [
    { slug: "/", name: "Home", template: "home", purpose: `Explain what ${qn.brandName} makes and for whom, and start quote requests`, blocks: ["hero", "trust_badges", "service_cards", "category_tiles", "product_grid", "process_steps", "testimonials", "faq", "cta_band"] },
    ...qn.services.map((s, i) => ({
      slug: `/services/${slugs[i]}`, name: fit(s.name, 60), template: "service" as const,
      purpose: fit(`Explain the ${s.name} service: ${firstSentence(s.description)}`, 200),
      blocks: ["hero", "image_text", "process_steps", "product_grid", "faq", "cta_band"] as Plan["pages"][number]["blocks"],
    })),
    { slug: "/how-it-works", name: "How It Works", template: "how_it_works", purpose: "Walk a buyer through the steps from first inquiry to delivery", blocks: ["hero", "process_steps", "faq", "cta_band"] },
    { slug: "/products", name: "Products", template: "products_index", purpose: "Overview of all product categories", blocks: ["hero", "category_tiles", "product_grid", "cta_band"] },
    { slug: "/about", name: "About", template: "about", purpose: `Who ${qn.brandName} is, where it is and why buyers choose it`, blocks: ["hero", "rich_text", "trust_badges", "image_text", "cta_band"] },
    { slug: "/request-samples", name: "Request Samples", template: "generic", purpose: "Collect sample requests", blocks: ["inquiry_form", "rich_text"] },
    { slug: "/faq", name: "FAQ", template: "faq", purpose: "Answer the questions buyers ask before requesting a quote", blocks: ["faq", "cta_band"] },
  ];
  return {
    pages,
    collections: cats.map((c) => ({ slug: slugify(c.name) || "products", name: fit(c.name, 60), shortName: fit(c.name, 30), service: slugs[0] })),
  };
}

export async function planSite(siteId: string) {
  const gen = await getGeneration(siteId);
  if (!gen) throw new Error("No generation for this site");
  const qn = gen.questionnaire;
  const cats = sheetCategories(gen.sheet);
  const slugs = serviceSlugs(qn);
  const fallback = defaultPlan(qn, cats);

  const prompt = loadPrompt("1-plan-site", {
    block_types: Object.keys(BLOCKS).filter((b) => !["header", "footer", "announcement_bar", "product_detail"].includes(b)).join(", "),
    default_pages: fallback.pages.map((p) => ({ slug: p.slug, template: p.template, blocks: p.blocks })),
    service_slugs: slugs.join(", "),
    h1_capable: "hero, rich_text, inquiry_form, faq, process_steps, image_text",
    questionnaire_json: { ...qn, email: undefined, inquiryEmail: undefined, phone: undefined },
    product_count: gen.sheet?.rows.length ?? 0,
    category_list: cats.map((c) => `${c.name} (${c.products.length})`).join("; ") || "none",
    keywords: qn.keywords.join(", ") || "none",
  });
  const res = await logJob(siteId, "plan", null, { categories: cats.length }, async () => {
    const r = await generate<Plan>({ task: "plan", ...prompt, jsonSchema: z.toJSONSchema(PlanSchema), zod: PlanSchema, context: {}, mock: () => fallback, maxTokens: 6000 });
    return r.ok ? { ok: true, output: r.value } : { ok: false, error: r.error };
  });
  let plan = res.ok ? (res.output as Plan) : fallback;

  // Categories always mirror the spreadsheet: the model may name/assign them, never add or drop them.
  const used = new Set<string>();
  plan = {
    ...plan,
    collections: cats.map((c) => {
      const ai = plan.collections.find((x) => x.name.toLowerCase() === c.name.toLowerCase() || x.slug === slugify(c.name));
      let slug = ai && /^[a-z0-9-]{2,60}$/.test(ai.slug) ? ai.slug : slugify(c.name) || "products";
      for (let i = 2; used.has(slug); i++) slug = `${slug}-${i}`;
      used.add(slug);
      return { slug, name: c.name.slice(0, 60), shortName: fit(ai?.shortName ?? c.name, 30), service: ai?.service ?? slugs[0] };
    }),
  };
  plan = enforcePlanRules(plan, qn, slugs);
  await q("UPDATE site_generations SET plan = $1, status = 'plan_ready', error = $2, updated_at = now() WHERE site_id = $3",
    [json(plan), res.ok ? null : `The model could not plan the site (${res.error}); the standard plan is shown instead.`, siteId]);
  return plan;
}

// ---------- 3. build

type Ctx = {
  siteId: string; qn: Questionnaire; plan: Plan; slugs: string[]; paths: Set<string>; quote: { label: string; href: string };
  sample: { label: string; href: string }; cats: ReturnType<typeof sheetCategories>; productCount: number;
};

const AI_BLOCKS: BlockType[] = ["hero", "trust_badges", "service_cards", "image_text", "process_steps", "faq", "rich_text", "cta_band"];
const SYSTEM_PAGES = new Set(["thank_you", "legal"]);

/** What the model writes for each block type. Ids, links, images and buttons are added by code. */
const CONTENT: Partial<Record<BlockType, z.ZodType>> = {
  hero: Hero.pick({ eyebrow: true, headline: true, subhead: true }),
  trust_badges: TrustBadges.pick({ items: true }),
  service_cards: z.object({ heading: ServiceCards.shape.heading, intro: ServiceCards.shape.intro, cards: z.array(z.object({ title: text(40), body: text(220) })).min(2).max(4) }),
  image_text: ImageText.pick({ heading: true, body: true, bullets: true }),
  process_steps: ProcessSteps.pick({ heading: true, intro: true, steps: true }),
  faq: Faq.pick({ heading: true, groups: true }),
  rich_text: RichText.pick({ heading: true, body: true }),
  cta_band: CtaBand.pick({ headline: true, body: true }),
};

function companyFacts(qn: Questionnaire) {
  const { email: _e, inquiryEmail: _i, phone: _p, stylePack: _s, tone: _t, testimonials: _x, ...rest } = qn;
  return rest;
}
function mockFacts(ctx: Ctx, extra: Record<string, unknown> = {}) {
  const { qn } = ctx;
  return {
    brand: qn.brandName, legalName: qn.legalName, city: qn.city, state: qn.state, industry: qn.industry, whatYouMake: qn.whatYouMake,
    services: qn.services, audience: qn.audience, certifications: qn.certifications, minimumOrder: qn.minimumOrder, leadTime: qn.leadTime,
    capacity: qn.capacity, differentiators: qn.differentiators, keywords: qn.keywords, foundedYear: qn.foundedYear,
    collections: ctx.plan.collections.map((c) => ({ name: c.name, shortName: c.shortName })), ...extra,
  };
}

/** Rewrites any link the model produced that is not a page of this site. */
function fixLinks(v: unknown, paths: Set<string>): unknown {
  if (Array.isArray(v)) return v.map((x) => fixLinks(x, paths));
  if (v && typeof v === "object") {
    const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fixLinks(x, paths)]));
    if (typeof o.href === "string" && !paths.has(o.href.split("#")[0] || "/")) o.href = "/contact";
    return o;
  }
  return v;
}

/** Blocks built entirely from data — no model involved. */
function deterministicBlock(ctx: Ctx, page: Plan["pages"][number], type: BlockType, id: string): Block | null {
  const { qn } = ctx;
  const phone = phoneParts(qn.phone).display;
  const cols = ctx.plan.collections;
  const svcIndex = page.template === "service" ? ctx.slugs.findIndex((s) => page.slug === `/services/${s}`) : -1;
  const svcCols = svcIndex >= 0 ? cols.filter((c) => c.service === ctx.slugs[svcIndex]) : [];
  switch (type) {
    case "category_tiles":
      return { id, type, heading: "Product categories", categories: (svcCols.length >= 2 ? svcCols : cols).slice(0, 12).map((c) => c.slug) };
    case "product_grid": {
      const viewAll = ctx.paths.has("/products") ? { label: "View all products", href: "/products" } : undefined;
      if (svcCols.length) return { id, type, heading: fit(`${qn.services[svcIndex].name}: ${svcCols[0].name}`, 70), source: { kind: "collection", collection: svcCols[0].slug }, limit: 8, viewAll: { label: "View the range", href: `/products/${svcCols[0].slug}` } };
      return { id, type, heading: "Featured products", source: { kind: "featured" }, limit: 8, ...(viewAll ? { viewAll } : {}) };
    }
    case "inquiry_form":
      return page.slug === "/request-samples"
        ? { id, type, form: "sample", heading: "Order samples", intro: "Tell us which products you want to try and where to ship them. We will confirm availability and cost by email.", submitLabel: "Request Samples" }
        : { id, type, form: "quote", heading: page.template === "contact" ? "Request a quote" : fit(`Talk to ${qn.brandName}`, 70), intro: "Tell us about your product, quantities and timeline. We will reply by email.", submitLabel: "Send Request" };
    case "contact_info":
      return { id, type, heading: "Contact details", showHours: false, showMap: false };
    case "testimonials":
      return qn.testimonials.length ? { id, type, heading: "What clients say", items: qn.testimonials.map((t) => ({ quote: t.quote, name: t.name, ...(t.company ? { company: t.company } : {}) })) } : null;
    case "stats": {
      const items = statsFromFacts(qn, ctx.productCount);
      return items.length >= 2 ? { id, type, heading: fit(`${qn.brandName} at a glance`, 70), items } : null;
    }
    case "rich_text": {
      if (page.template === "thank_you")
        return { id, type, heading: "Thank you — we received your request", body: `Our team will review your request and reply by email. If it is urgent, call **${phone}**.\n\n[Back to the home page](/)`, width: "narrow", background: "surface" };
      if (page.template === "legal") return { id, type, heading: page.name.slice(0, 70), body: legalText(page.slug, qn), width: "narrow", background: "surface" };
      return null;
    }
    default:
      return null;
  }
}

function legalText(slug: string, qn: Questionnaire) {
  const note = SAMPLE_NOTICE_TEXT; // blocks publishing until an owner confirms the pages were reviewed
  if (slug === "/privacy")
    return note + `### What we collect\nInformation you submit in forms on this site (name, company, email, phone and project details) and basic analytics data.\n\n### How we use it\nTo answer inquiries, prepare quotes, send samples and fulfill orders, and — only if you opt in — to send occasional updates from ${qn.legalName}.\n\n### Your choices\nYou can ask us to show, correct or delete your information by emailing ${qn.email}. California residents have additional rights under the CCPA/CPRA. We honor Global Privacy Control signals.`;
  if (slug === "/terms")
    return note + `### Use of this site\nThis website is operated by ${qn.legalName}, ${qn.city}, ${qn.state}. Product information is provided for business buyers and may change without notice.\n\n### Quotes and orders\nPrices, minimums and lead times are confirmed in writing in each quote. Orders are governed by the written agreement or quote you accept.\n\n### Contact\nQuestions about these terms: ${qn.email}.`;
  return note + `${qn.legalName} wants this website to be usable by everyone. We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.1 level AA.\n\nIf you have trouble using any part of the site, email ${qn.email} or call ${phoneParts(qn.phone).display} and we will help and fix the problem.`;
}

/** Fills in what the model must not decide: buttons, links, images, ids. */
function finishBlock(ctx: Ctx, page: Plan["pages"][number], type: BlockType, id: string, content: Record<string, unknown>, index: number): Block {
  const b: Record<string, unknown> = { ...(fixLinks(content, ctx.paths) as object), id, type };
  const wantsSample = ctx.sample.href !== ctx.quote.href;
  if (type === "hero") {
    b.variant = page.template === "home" ? "brand" : "compact";
    b.primaryCta = ctx.quote;
    if (wantsSample && ["home", "service", "products_index"].includes(page.template)) b.secondaryCta = ctx.sample;
  }
  if (type === "cta_band") { b.primary = ctx.quote; if (wantsSample) b.secondary = ctx.sample; }
  if (type === "service_cards") {
    const cards = (b.cards as { title: string; body: string }[]).slice(0, Math.max(2, ctx.qn.services.length));
    b.cards = cards.map((c, i) => {
      const href = `/services/${ctx.slugs[i]}`;
      return { ...c, link: { label: "Learn more", href: ctx.paths.has(href) ? href : "/contact" } };
    });
  }
  if (type === "image_text") {
    // Platform illustration until the company uploads its own photo (the editor shows it as replaceable).
    b.image = { src: "/images/lab.svg", alt: `Illustration of a production facility`, width: 720, height: 540 };
    b.imageSide = index % 2 ? "left" : "right";
  }
  if (type === "rich_text") { b.width = "narrow"; b.background = "surface"; }
  return b as Block;
}

async function saveBlock(siteId: string, slug: string, block: Block) {
  await q("UPDATE sections s SET data = $1 FROM pages p WHERE s.page_id = p.id AND p.site_id = $2 AND p.slug = $3 AND s.block_id = $4",
    [json(block), siteId, slug, block.id]);
}

async function writeBlock(ctx: Ctx, page: Plan["pages"][number], type: BlockType, id: string, index: number, previous: string[]) {
  const content = CONTENT[type]!;
  const prompt = loadPrompt("2-write-block", {
    tone: ctx.qn.tone, site_paths: [...ctx.paths].join(", "), block_type: type, page_name: page.name, page_slug: page.slug,
    page_purpose: page.purpose, company_json: companyFacts(ctx.qn),
    context_json: ctx.plan.collections.map((c) => ({ name: c.name, path: `/products/${c.slug}`, products: ctx.cats.find((x) => x.name === c.name)?.products.slice(0, 12) })),
    previous_blocks_summary: previous.join(" | ") || "nothing yet",
  });
  return logJob<Block>(ctx.siteId, "block", `${page.slug}#${id}`, { type, page: page.slug }, async () => {
    const r = await generate({
      task: `block:${type}`, ...prompt, jsonSchema: z.toJSONSchema(content), zod: content as z.ZodType<Record<string, unknown>>,
      context: mockFacts(ctx, { page: { name: page.name, purpose: page.purpose, slug: page.slug } }),
    });
    if (!r.ok) return { ok: false, error: r.error };
    const block = finishBlock(ctx, page, type, id, r.value as Record<string, unknown>, index);
    const check = BLOCKS[type].safeParse(block);
    if (!check.success) return { ok: false, error: check.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    await saveBlock(ctx.siteId, page.slug, check.data as Block);
    return { ok: true, output: check.data as Block };
  });
}

const blockSummary = (b: Block) => {
  const o = b as Record<string, unknown>;
  return `${b.type}: ${String(o.headline ?? o.heading ?? "")}`.slice(0, 120);
};

async function writeIntro(ctx: Ctx, c: Plan["collections"][number], others: string[]) {
  const cat = ctx.cats.find((x) => x.name === c.name);
  const schema = z.object({ intro: CollectionSchema.shape.intro });
  const prompt = loadPrompt("3-category-intro", {
    tone: ctx.qn.tone, category_name: c.name, service_name: ctx.qn.services[ctx.slugs.indexOf(c.service)]?.name ?? "",
    other_intros_first_sentences: others.join(" | ") || "none yet", products: cat?.details.length ? cat.details : cat?.products ?? [], company_json: companyFacts(ctx.qn),
  });
  return logJob<string>(ctx.siteId, "intro", c.slug, { category: c.name }, async () => {
    const r = await generate({
      task: "category_intro", ...prompt, jsonSchema: z.toJSONSchema(schema), zod: schema,
      context: mockFacts(ctx, { collection: { name: c.name, shortName: c.shortName, products: cat?.products ?? [], details: cat?.details ?? [] } }),
    });
    if (!r.ok) return { ok: false, error: r.error };
    await q("UPDATE collections SET data = jsonb_set(data, '{intro}', $1::jsonb) WHERE site_id = $2 AND slug = $3", [JSON.stringify(r.value.intro), ctx.siteId, c.slug]);
    return { ok: true, output: r.value.intro };
  });
}

async function writeSeo(ctx: Ctx, page: Plan["pages"][number], used: string[]) {
  const schema = z.object({ title: text(60), description: z.string().min(70).max(160) });
  const prompt = loadPrompt("4-page-seo", {
    used_titles: used.join(" | ") || "none yet", page_name: page.name, page_slug: page.slug, page_purpose: page.purpose,
    brand: ctx.qn.brandName, keywords: ctx.qn.keywords.join(", ") || "none", company_json: companyFacts(ctx.qn),
  });
  return logJob<{ title: string; description: string }>(ctx.siteId, "seo", page.slug, {}, async () => {
    const r = await generate({ task: "seo", ...prompt, jsonSchema: z.toJSONSchema(schema), zod: schema, context: mockFacts(ctx, { page: { name: page.name, purpose: page.purpose, slug: page.slug } }) });
    if (!r.ok) return { ok: false, error: r.error };
    let title = r.value.title;
    const taken = (t: string) => used.some((u) => u.toLowerCase() === t.toLowerCase());
    if (taken(title)) title = fit(`${page.name} | ${ctx.qn.brandName}`, 60);
    if (taken(title)) title = fit(`${page.name} ${page.slug} | ${ctx.qn.brandName}`, 60);
    const seo = { title, description: r.value.description, noindex: page.template === "thank_you" };
    await q("UPDATE pages SET seo = $1 WHERE site_id = $2 AND slug = $3", [json(seo), ctx.siteId, page.slug]);
    return { ok: true, output: { title, description: seo.description } };
  });
}

function buildGlobals(ctx: Ctx, logo: Logo | null): Site["globals"] {
  const { qn, plan } = ctx;
  const has = (p: string) => ctx.paths.has(p);
  const servicePages = plan.pages.filter((p) => p.template === "service");
  const link = (label: string, href: string) => ({ label: fit(label, 30), href });
  const svcLinks = [...servicePages.map((p) => link(p.name, p.slug)), ...(has("/how-it-works") ? [link("How It Works", "/how-it-works")] : [])];
  const nav: { label: string; href: string; children?: unknown[] }[] = [];
  if (svcLinks.length) nav.push({ label: "Services", href: svcLinks[0].href, children: svcLinks });
  if (has("/products")) nav.push({ label: "Products", href: "/products", ...(plan.collections.length ? { children: plan.collections.slice(0, 12).map((c) => link(c.shortName, `/products/${c.slug}`)) } : {}) });
  for (const [label, href] of [["About", "/about"], ["FAQ", "/faq"], ["Contact", "/contact"]] as const) if (has(href)) nav.push(link(label, href));
  for (const p of plan.pages.filter((p) => p.template === "generic" && p.slug !== "/request-samples")) if (nav.length < 7) nav.splice(nav.length - 1, 0, link(p.name, p.slug));
  if (nav.length < 2) nav.unshift(link("Home", "/"));

  const companyLinks = [["About Us", "/about"], ["FAQ", "/faq"], ["Request Samples", "/request-samples"], ["Contact", "/contact"]].filter(([, h]) => has(h)).map(([l, h]) => link(l, h));
  const productLinks = has("/products") ? [link("All Products", "/products"), ...plan.collections.slice(0, 5).map((c) => link(c.shortName, `/products/${c.slug}`))] : [];
  const columns = [
    svcLinks.length ? { title: "Services", links: svcLinks.slice(0, 10) } : null,
    productLinks.length ? { title: "Products", links: productLinks } : null,
    companyLinks.length ? { title: "Company", links: companyLinks } : null,
  ].filter(Boolean) as Site["globals"]["footer"]["columns"];

  return {
    header: {
      id: "header", type: "header",
      logo: logo ? { src: logo.src, alt: fit(`${qn.brandName} logo`, 125), width: logo.width, height: logo.height } : { src: "/images/logo-mark.svg", alt: fit(`${qn.brandName} logo`, 125), width: 40, height: 40 },
      // A wide logo is a wordmark that already spells the name; a square mark gets the name beside it.
      ...(!logo || logo.width / logo.height < 1.6 ? { logoText: qn.brandName } : {}),
      nav: nav.slice(0, 7) as Site["globals"]["header"]["nav"],
      cta: ctx.quote,
    },
    footer: {
      id: "footer", type: "footer",
      blurb: fit(`${cap(qn.industry)} for ${qn.audience}. ${qn.legalName}, ${qn.city}, ${qn.state}.`, 200),
      columns: columns.length ? columns : [{ title: "Company", links: [link("Contact", "/contact")] }],
      legalLinks: [link("Privacy Policy", "/privacy"), link("Terms", "/terms"), link("Accessibility", "/accessibility")],
    },
  };
}

function makeCtx(gen: GenerationRow): Ctx {
  const plan = gen.plan!;
  const paths = new Set<string>([...plan.pages.map((p) => p.slug), ...plan.collections.map((c) => `/products/${c.slug}`)]);
  return {
    siteId: gen.site_id, qn: gen.questionnaire, plan, slugs: serviceSlugs(gen.questionnaire), paths,
    quote: { label: "Request a Quote", href: "/contact" },
    sample: paths.has("/request-samples") ? { label: "Order Samples", href: "/request-samples" } : { label: "Request a Quote", href: "/contact" },
    cats: sheetCategories(gen.sheet), productCount: gen.sheet?.rows.length ?? 0,
  };
}

/** Builds the whole draft from the confirmed plan. Safe to run again: it replaces the draft. */
export async function runGeneration(siteId: string) {
  const gen = await getGeneration(siteId);
  if (!gen?.plan) throw new Error("Confirm the plan first");
  const ctx = makeCtx(gen);
  const { qn, plan } = ctx;
  try {
    // Earlier attempts stay in the table for usage/cost history but leave the progress view.
    await q("UPDATE ai_jobs SET status = 'superseded' WHERE site_id = $1 AND step <> 'plan' AND status <> 'superseded'", [siteId]);
    const siteRow = await one<{ theme: Theme }>("SELECT theme FROM sites WHERE id = $1", [siteId]);

    // Skeleton: every page with every block, AI blocks as [[TODO]] placeholders for now.
    const aiQueue: { page: Plan["pages"][number]; type: BlockType; id: string; index: number }[] = [];
    const pages: Site["pages"] = plan.pages.map((page) => {
      const counts: Record<string, number> = {};
      const types = [...page.blocks];
      // Verified numbers only: add a stats block to the About page when the company gave at least two.
      if (page.template === "about" && statsFromFacts(qn, ctx.productCount).length >= 2) types.splice(Math.min(2, types.length), 0, "stats");
      const sections: Block[] = [];
      types.forEach((type, index) => {
        counts[type] = (counts[type] ?? 0) + 1;
        const id = counts[type] > 1 ? `${type}-${counts[type]}` : type;
        const fixed = deterministicBlock(ctx, page, type, id);
        if (fixed) { sections.push(fixed); return; }
        if (!AI_BLOCKS.includes(type) || SYSTEM_PAGES.has(page.template)) return; // nothing true to put there
        sections.push(defaultBlock(type, id, { collections: plan.collections.map((c) => c.slug) }));
        aiQueue.push({ page, type, id, index });
      });
      return { slug: page.slug, template: page.template, name: page.name, sections, seo: { noindex: page.template === "thank_you" } };
    });

    const site: Site = {
      version: 1,
      company: companyFrom(qn),
      theme: siteRow?.theme ?? { stylePack: "industrial-solid", ...STYLE_PACKS["industrial-solid"] },
      services: qn.services.map((s, i) => ({ slug: ctx.slugs[i], name: s.name.slice(0, 40) })),
      globals: buildGlobals(ctx, gen.logo),
      pages,
      collections: plan.collections.map((c) => {
        const cat = ctx.cats.find((x) => x.name === c.name);
        return {
          slug: c.slug, name: c.name, shortName: c.shortName, service: c.service,
          intro: TODO("write a 130–180 word introduction for this category: why buyers need it, what the range covers, options and how to order"),
          image: { src: cat?.image ?? "/images/placeholder-product.svg", alt: fit(`${c.name} from ${qn.brandName}`, 125), width: 800, height: 800 },
          seo: { noindex: false },
        };
      }),
      products: [],
      templates: {
        collection: ["hero", "intro", "products", "faq", "seo_body", "cta"],
        product: ["detail", "related", "cta"],
        collectionSubhead: fit(`{count} products from ${qn.brandName}. Request samples or a quote.`, 160),
        collectionCta: { headline: "Tell us what you need", body: fit(`Share your product, quantities and timeline, and ${qn.brandName} will reply with options and a quote.`, 200) },
      },
      defaultCtas: { quote: ctx.quote, sample: ctx.sample },
    };
    await logJob(siteId, "skeleton", null, {}, async () => {
      await writeDraft(siteId, { site, hidden: [] });
      return { ok: true, output: { pages: pages.length, aiBlocks: aiQueue.length } };
    });

    // Products: imported from the sheet exactly as given (no AI), then the first of each category is featured.
    let importOut: Summary["products"] = { created: 0, failed: [] };
    if (gen.sheet && plan.collections.length) {
      const res = await logJob(siteId, "products", null, { rows: gen.sheet.rows.length }, async () => {
        const { results } = await importProducts(siteId, gen.sheet!.headers, gen.sheet!.rows, gen.sheet!.mapping);
        const failed = results.filter((r) => r.status === "failed");
        return { ok: failed.length < results.length, output: { created: results.length - failed.length, failed }, error: failed.length === results.length ? "No product rows could be imported" : undefined };
      });
      importOut = (res.output as Summary["products"]) ?? importOut;
      await q(`UPDATE products p SET data = jsonb_set(p.data, '{featured}', 'true')
               WHERE p.site_id = $1 AND NOT EXISTS (SELECT 1 FROM products x WHERE x.site_id = $1 AND (x.data->>'featured')::boolean)
                 AND p.id IN (SELECT DISTINCT ON (collection) id FROM products WHERE site_id = $1 ORDER BY collection, position, id)`, [siteId]);
    }

    // Copy: blocks page by page (in order, so each block sees what is above it), category intros, page SEO.
    const byPage = new Map<string, typeof aiQueue>();
    for (const job of aiQueue) byPage.set(job.page.slug, [...(byPage.get(job.page.slug) ?? []), job]);
    await Promise.all([
      pool([...byPage.values()], 3, async (jobs) => {
        const previous: string[] = [];
        for (const j of jobs) {
          const r = await writeBlock(ctx, j.page, j.type, j.id, j.index, previous);
          if (r.ok && r.output) previous.push(blockSummary(r.output as Block));
        }
      }),
      (async () => {
        const firsts: string[] = [];
        for (const c of plan.collections) {
          const r = await writeIntro(ctx, c, firsts);
          if (r.ok && typeof r.output === "string") firsts.push(firstSentence(r.output));
        }
      })(),
      (async () => {
        const used: string[] = [];
        for (const p of plan.pages) {
          const r = await writeSeo(ctx, p, used);
          if (r.ok && r.output) used.push((r.output as { title: string }).title);
        }
      })(),
    ]);
    await finish(siteId, importOut);
  } catch (e) {
    await setStatus(siteId, "failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

async function finish(siteId: string, products?: Summary["products"]) {
  const draft = await assembleDraft(siteId);
  const { issues } = validateSite(draft!.site);
  const jobs = await listJobs(siteId);
  const prev = (await getGeneration(siteId))?.summary;
  const errors = issues.filter((i) => i.level === "error");
  const summary: Summary = {
    pages: draft!.site.pages.length,
    blocks: draft!.site.pages.reduce((n, p) => n + p.sections.length, 0),
    aiBlocks: jobs.filter((j) => j.step === "block" && j.status === "done").length,
    failedJobs: jobs.filter((j) => j.status === "failed").length,
    products: products ?? prev?.products ?? { created: 0, failed: [] },
    todos: errors.filter((i) => i.message.includes("[[TODO")).map(({ where, message }) => ({ where, message })),
    errors: errors.filter((i) => !i.message.includes("[[TODO")).map(({ where, message }) => ({ where, message })),
    warnings: issues.filter((i) => i.level === "warning").length,
  };
  await q("UPDATE sites SET status = CASE WHEN status = 'generating' THEN 'draft' ELSE status END, updated_at = now() WHERE id = $1", [siteId]);
  await setStatus(siteId, "done", { summary });
}

/** Re-runs one failed (or unwanted) step: a block, a category intro or a page's SEO fields. */
export async function retryJob(siteId: string, jobId: number) {
  const gen = await getGeneration(siteId);
  const job = await one<JobRow>("SELECT * FROM ai_jobs WHERE site_id = $1 AND id = $2", [siteId, jobId]);
  if (!gen?.plan || !job?.target) return { ok: false as const, error: "Nothing to retry" };
  const ctx = makeCtx(gen);
  let res: { ok: boolean; error?: string };
  if (job.step === "block") {
    const [slug, id] = job.target.split("#");
    const page = ctx.plan.pages.find((p) => p.slug === slug);
    const row = await one<{ type: BlockType; position: number }>(
      "SELECT s.type, s.position FROM sections s JOIN pages p ON p.id = s.page_id WHERE p.site_id = $1 AND p.slug = $2 AND s.block_id = $3", [siteId, slug, id]);
    if (!page || !row) return { ok: false as const, error: "That block no longer exists" };
    res = await writeBlock(ctx, page, row.type, id, row.position, []);
  } else if (job.step === "intro") {
    const c = ctx.plan.collections.find((x) => x.slug === job.target);
    if (!c) return { ok: false as const, error: "That category no longer exists" };
    res = await writeIntro(ctx, c, []);
  } else if (job.step === "seo") {
    const p = ctx.plan.pages.find((x) => x.slug === job.target);
    if (!p) return { ok: false as const, error: "That page no longer exists" };
    const used = (await q<{ t: string }>("SELECT seo->>'title' AS t FROM pages WHERE site_id = $1 AND slug <> $2 AND seo ? 'title'", [siteId, p.slug])).map((r) => r.t);
    res = await writeSeo(ctx, p, used);
  } else return { ok: false as const, error: "This step cannot be retried on its own" };
  if (res.ok) await q("UPDATE ai_jobs SET status = 'superseded' WHERE id = $1", [jobId]); // the new attempt has its own log row
  await finish(siteId);
  return res.ok ? { ok: true as const } : { ok: false as const, error: res.error ?? "Failed again" };
}

/** Saves the user's edits to the plan (pages to keep, category → service, column mapping). */
export async function confirmPlan(siteId: string, edits: { dropPages: string[]; services: Record<string, string> }) {
  const gen = await getGeneration(siteId);
  if (!gen?.plan) return { ok: false as const, error: "No plan to confirm" };
  const slugs = serviceSlugs(gen.questionnaire);
  const plan: Plan = {
    pages: gen.plan.pages.filter((p) => !edits.dropPages.includes(p.slug)),
    collections: gen.plan.collections.map((c) => ({ ...c, service: slugs.includes(edits.services[c.slug]) ? edits.services[c.slug] : c.service })),
  };
  const final = enforcePlanRules(plan, gen.questionnaire, slugs); // required pages come back even if unticked
  await q("UPDATE site_generations SET plan = $1, status = 'generating', error = NULL, updated_at = now() WHERE site_id = $2", [json(final), siteId]);
  return { ok: true as const };
}

export async function updateMapping(siteId: string, mapping: Mapping) {
  const gen = await getGeneration(siteId);
  if (!gen?.sheet) return;
  await q("UPDATE site_generations SET sheet = $1, updated_at = now() WHERE site_id = $2", [json({ ...gen.sheet, mapping }), siteId]);
  await planSite(siteId);
}
