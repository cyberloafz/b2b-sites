import { randomBytes } from "node:crypto";
import type { z } from "zod";
import { json, one, q, tx, type Queryable } from "@/db/client";
import { BLOCKS, BlockSchema, GLOBAL_ONLY, type Block, type BlockType } from "@/schema/blocks";
import { CollectionSchema, CompanySchema, PageSchema, ProductSchema, ServiceSchema, SeoSchema, type Site } from "@/schema/site";
import { ThemeSchema, checkThemeContrast } from "@/schema/theme";
import { defaultBlock } from "@/lib/block-defaults";

/**
 * Every write the admin can make. Each one validates with the same zod schema the renderer and
 * the AI use, so the database can never hold content the site cannot render.
 */

export type FieldError = { path: (string | number)[]; message: string };
export type Result<T = undefined> = { ok: true; value?: T } | { ok: false; errors: FieldError[] };

const fail = (message: string, path: (string | number)[] = []): Result<never> => ({ ok: false, errors: [{ path, message }] });
const zodErrors = (e: z.ZodError): FieldError[] => e.issues.map((i) => ({ path: i.path as (string | number)[], message: i.message }));
const shortId = () => randomBytes(4).toString("hex");

async function touch(siteId: string) {
  await q("UPDATE sites SET updated_at = now() WHERE id = $1", [siteId]);
}

// ---------- pages ----------

export async function listPages(siteId: string) {
  return q<{ id: number; slug: string; name: string; template: string; blocks: number }>(
    `SELECT p.id, p.slug, p.name, p.template, count(s.id)::int AS blocks
       FROM pages p LEFT JOIN sections s ON s.page_id = p.id
      WHERE p.site_id = $1 GROUP BY p.id ORDER BY p.position, p.id`, [siteId]);
}

export async function getPage(siteId: string, pageId: number) {
  const page = await one<{ id: number; slug: string; name: string; template: string; seo: Site["pages"][number]["seo"] }>(
    "SELECT id, slug, name, template, seo FROM pages WHERE site_id = $1 AND id = $2", [siteId, pageId]);
  if (!page) return null;
  const sections = await q<{ id: number; block_id: string; type: BlockType; position: number; visible: boolean; data: Block }>(
    "SELECT id, block_id, type, position, visible, data FROM sections WHERE page_id = $1 ORDER BY position", [pageId]);
  return { ...page, sections };
}

async function pageOf(siteId: string, sectionId: number) {
  return one<{ page_id: number; position: number; type: BlockType; data: Block }>(
    "SELECT s.page_id, s.position, s.type, s.data FROM sections s JOIN pages p ON p.id = s.page_id WHERE p.site_id = $1 AND s.id = $2", [siteId, sectionId]);
}

async function renumber(pageId: number) {
  const rows = await q<{ id: number }>("SELECT id FROM sections WHERE page_id = $1 ORDER BY position, id", [pageId]);
  await tx(async (t) => {
    for (const [i, r] of rows.entries()) await t.query("UPDATE sections SET position = $1 WHERE id = $2", [i, r.id]);
  });
}

export async function saveBlock(siteId: string, sectionId: number, input: unknown): Promise<Result> {
  const cur = await pageOf(siteId, sectionId);
  if (!cur) return fail("Block not found");
  const parsed = BLOCKS[cur.type].safeParse({ ...(input as object), id: cur.data.id, type: cur.type });
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  await q("UPDATE sections SET data = $1 WHERE id = $2", [json(parsed.data), sectionId]);
  await touch(siteId);
  return { ok: true };
}

export async function addBlock(siteId: string, pageId: number, type: BlockType, afterPosition: number): Promise<Result<number>> {
  if (GLOBAL_ONLY.includes(type) || type === "product_detail") return fail("This block is placed automatically");
  const page = await one("SELECT id FROM pages WHERE site_id = $1 AND id = $2", [siteId, pageId]);
  if (!page) return fail("Page not found");
  const cols = await q<{ slug: string }>("SELECT slug FROM collections WHERE site_id = $1 ORDER BY position", [siteId]);
  const block = defaultBlock(type, `${type.replace(/_/g, "-")}-${shortId()}`, { collections: cols.map((c) => c.slug) });
  const parsed = BlockSchema.safeParse(block);
  if (!parsed.success) return fail(type === "category_tiles" ? "Add at least two product categories first" : "Could not create this block");
  await q("UPDATE sections SET position = position + 1 WHERE page_id = $1 AND position > $2", [pageId, afterPosition]);
  const row = await one<{ id: number }>("INSERT INTO sections (page_id, block_id, type, position, data) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [pageId, parsed.data.id, type, afterPosition + 1, json(parsed.data)]);
  await touch(siteId);
  return { ok: true, value: row!.id };
}

export async function moveBlock(siteId: string, sectionId: number, toPosition: number): Promise<Result> {
  const cur = await pageOf(siteId, sectionId);
  if (!cur) return fail("Block not found");
  const ids = (await q<{ id: number }>("SELECT id FROM sections WHERE page_id = $1 ORDER BY position, id", [cur.page_id])).map((r) => r.id);
  const from = ids.indexOf(sectionId);
  const to = Math.max(0, Math.min(ids.length - 1, toPosition));
  ids.splice(to, 0, ...ids.splice(from, 1));
  await tx(async (t) => {
    for (const [i, id] of ids.entries()) await t.query("UPDATE sections SET position = $1 WHERE id = $2", [i, id]);
  });
  await touch(siteId);
  return { ok: true };
}

export async function setBlockVisible(siteId: string, sectionId: number, visible: boolean): Promise<Result> {
  const cur = await pageOf(siteId, sectionId);
  if (!cur) return fail("Block not found");
  await q("UPDATE sections SET visible = $1 WHERE id = $2", [visible, sectionId]);
  await touch(siteId);
  return { ok: true };
}

export async function deleteBlock(siteId: string, sectionId: number): Promise<Result> {
  const cur = await pageOf(siteId, sectionId);
  if (!cur) return fail("Block not found");
  await q("DELETE FROM sections WHERE id = $1", [sectionId]);
  await renumber(cur.page_id);
  await touch(siteId);
  return { ok: true };
}

export async function duplicateBlock(siteId: string, sectionId: number): Promise<Result<number>> {
  const cur = await pageOf(siteId, sectionId);
  if (!cur) return fail("Block not found");
  if (cur.type === "product_detail") return fail("This block cannot be duplicated");
  const copy = { ...cur.data, id: `${cur.type.replace(/_/g, "-")}-${shortId()}` };
  await q("UPDATE sections SET position = position + 1 WHERE page_id = $1 AND position > $2", [cur.page_id, cur.position]);
  const row = await one<{ id: number }>("INSERT INTO sections (page_id, block_id, type, position, data) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [cur.page_id, copy.id, cur.type, cur.position + 1, json(copy)]);
  await touch(siteId);
  return { ok: true, value: row!.id };
}

const PageSettings = PageSchema.pick({ slug: true, name: true, template: true }).extend({ seo: SeoSchema });

export async function savePageSettings(siteId: string, pageId: number, input: unknown): Promise<Result> {
  const parsed = PageSettings.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const cur = await one<{ slug: string }>("SELECT slug FROM pages WHERE site_id = $1 AND id = $2", [siteId, pageId]);
  if (!cur) return fail("Page not found");
  const v = parsed.data;
  if (cur.slug === "/" && v.slug !== "/") return fail("The home page address cannot change", ["slug"]);
  const clash = await one("SELECT 1 FROM pages WHERE site_id = $1 AND slug = $2 AND id <> $3", [siteId, v.slug, pageId]);
  if (clash) return fail("Another page already uses this address", ["slug"]);
  await tx(async (t) => {
    await t.query("UPDATE pages SET slug = $1, name = $2, template = $3, seo = $4 WHERE id = $5", [v.slug, v.name, v.template, json(v.seo), pageId]);
    if (cur.slug !== v.slug) await addRedirect(t, siteId, cur.slug, v.slug);
  });
  await touch(siteId);
  return { ok: true };
}

export async function createPage(siteId: string, input: { name: string; slug: string }): Promise<Result<number>> {
  const slug = "/" + input.slug.toLowerCase().replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9/-]+/g, "-");
  if (!input.name.trim()) return fail("Enter a page name", ["name"]);
  if (slug === "/" || !PageSchema.shape.slug.safeParse(slug).success) return fail("Use letters, numbers and hyphens, e.g. /quality", ["slug"]);
  if (await one("SELECT 1 FROM pages WHERE site_id = $1 AND slug = $2", [siteId, slug])) return fail("A page with this address already exists", ["slug"]);
  const pos = await one<{ n: number }>("SELECT coalesce(max(position), 0)::int + 1 AS n FROM pages WHERE site_id = $1", [siteId]);
  const hero = defaultBlock("hero", "hero");
  if (hero.type === "hero") hero.headline = input.name.trim().slice(0, 70);
  const row = await one<{ id: number }>("INSERT INTO pages (site_id, slug, template, name, seo, position) VALUES ($1,$2,'generic',$3,'{}',$4) RETURNING id",
    [siteId, slug, input.name.trim().slice(0, 60), pos!.n]);
  await q("INSERT INTO sections (page_id, block_id, type, position, data) VALUES ($1,'hero','hero',0,$2)", [row!.id, json(hero)]);
  await touch(siteId);
  return { ok: true, value: row!.id };
}

export async function deletePage(siteId: string, pageId: number): Promise<Result> {
  const p = await one<{ slug: string }>("SELECT slug FROM pages WHERE site_id = $1 AND id = $2", [siteId, pageId]);
  if (!p) return fail("Page not found");
  if (p.slug === "/") return fail("The home page cannot be deleted");
  await q("DELETE FROM pages WHERE id = $1", [pageId]);
  await touch(siteId);
  return { ok: true };
}

// ---------- site-wide settings ----------

export async function saveGlobal(siteId: string, key: "announcement" | "header" | "footer", input: unknown | null): Promise<Result> {
  const row = await one<{ globals: Site["globals"] }>("SELECT globals FROM sites WHERE id = $1", [siteId]);
  if (!row) return fail("Site not found");
  const next = { ...row.globals };
  if (input === null) {
    if (key !== "announcement") return fail("The header and footer cannot be removed");
    delete next.announcement;
  } else {
    const type = key === "announcement" ? "announcement_bar" : key;
    const parsed = BLOCKS[type].safeParse({ ...(input as object), id: key, type });
    if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
    (next as Record<string, unknown>)[key] = parsed.data;
  }
  await q("UPDATE sites SET globals = $1, updated_at = now() WHERE id = $2", [json(next), siteId]);
  return { ok: true };
}

export async function saveTheme(siteId: string, input: unknown): Promise<Result> {
  const parsed = ThemeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const contrast = checkThemeContrast(parsed.data);
  if (contrast.length) return { ok: false, errors: contrast.map((m) => ({ path: ["color"], message: m })) };
  await q("UPDATE sites SET theme = $1, updated_at = now() WHERE id = $2", [json(parsed.data), siteId]);
  return { ok: true };
}

export async function saveCompany(siteId: string, input: unknown): Promise<Result> {
  const parsed = CompanySchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  await q("UPDATE sites SET company = $1, name = $2, updated_at = now() WHERE id = $3", [json(parsed.data), parsed.data.brandName, siteId]);
  return { ok: true };
}

export async function saveServices(siteId: string, input: unknown): Promise<Result> {
  const parsed = ServiceSchema.array().min(1).max(5).safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  await q("UPDATE sites SET services = $1, updated_at = now() WHERE id = $2", [json(parsed.data), siteId]);
  return { ok: true };
}

export async function saveSettings(siteId: string, input: { crmWebhookUrl?: string; allowAiCrawlers?: boolean; gscProperty?: string }): Promise<Result> {
  const url = input.crmWebhookUrl?.trim();
  if (url && !/^https:\/\/\S+$/.test(url)) return fail("Use a full https:// address", ["crmWebhookUrl"]);
  const gsc = input.gscProperty?.trim();
  if (gsc && !/^(sc-domain:[a-z0-9.-]+|https:\/\/\S+\/)$/i.test(gsc)) return fail('Use "sc-domain:example.com" or "https://www.example.com/"', ["gscProperty"]);
  const cur = await one<{ settings: Record<string, unknown> }>("SELECT settings FROM sites WHERE id = $1", [siteId]);
  await q("UPDATE sites SET settings = $1, updated_at = now() WHERE id = $2",
    [json({ ...(cur?.settings ?? {}), crmWebhookUrl: url || undefined, allowAiCrawlers: input.allowAiCrawlers !== false, gscProperty: gsc || undefined }), siteId]);
  return { ok: true };
}

// ---------- products & categories ----------

export async function listProducts(siteId: string) {
  return q<{ id: number; slug: string; collection: string; data: Site["products"][number] }>(
    "SELECT id, slug, collection, data FROM products WHERE site_id = $1 ORDER BY collection, position, id", [siteId]);
}

export async function getProduct(siteId: string, slug: string) {
  return one<{ id: number; data: Site["products"][number] }>("SELECT id, data FROM products WHERE site_id = $1 AND slug = $2", [siteId, slug]);
}

export async function saveProduct(siteId: string, originalSlug: string | null, input: unknown): Promise<Result<string>> {
  const parsed = ProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const p = parsed.data;
  if (["new", "import"].includes(p.slug)) return fail("This address is reserved; choose another", ["slug"]);
  if (!(await one("SELECT 1 FROM collections WHERE site_id = $1 AND slug = $2", [siteId, p.collection]))) return fail("Choose an existing category", ["collection"]);
  const clash = await one("SELECT 1 FROM products WHERE site_id = $1 AND slug = $2 AND slug <> coalesce($3, '')", [siteId, p.slug, originalSlug]);
  if (clash) return fail("Another product already uses this address", ["slug"]);
  await tx(async (t) => {
    if (originalSlug) {
      const old = await t.query<{ collection: string }>("SELECT collection FROM products WHERE site_id = $1 AND slug = $2", [siteId, originalSlug]);
      await t.query("UPDATE products SET slug = $1, collection = $2, data = $3 WHERE site_id = $4 AND slug = $5", [p.slug, p.collection, json(p), siteId, originalSlug]);
      const was = old.rows[0];
      if (was && (was.collection !== p.collection || originalSlug !== p.slug))
        await addRedirect(t, siteId, `/products/${was.collection}/${originalSlug}`, `/products/${p.collection}/${p.slug}`);
    } else {
      await t.query("INSERT INTO products (site_id, slug, collection, position, data) VALUES ($1,$2,$3,(SELECT coalesce(max(position),0)+1 FROM products WHERE site_id=$1),$4)",
        [siteId, p.slug, p.collection, json(p)]);
    }
  });
  await touch(siteId);
  return { ok: true, value: p.slug };
}

export async function deleteProduct(siteId: string, slug: string): Promise<Result> {
  const p = await one<{ collection: string }>("SELECT collection FROM products WHERE site_id = $1 AND slug = $2", [siteId, slug]);
  if (!p) return fail("Product not found");
  await tx(async (t) => {
    await t.query("DELETE FROM products WHERE site_id = $1 AND slug = $2", [siteId, slug]);
    await addRedirect(t, siteId, `/products/${p.collection}/${slug}`, `/products/${p.collection}`);
  });
  await touch(siteId);
  return { ok: true };
}

export async function listCollections(siteId: string) {
  return q<{ id: number; slug: string; data: Site["collections"][number]; products: number }>(
    `SELECT c.id, c.slug, c.data, (SELECT count(*)::int FROM products p WHERE p.site_id = c.site_id AND p.collection = c.slug) AS products
       FROM collections c WHERE c.site_id = $1 ORDER BY c.position, c.id`, [siteId]);
}

export async function getCollection(siteId: string, slug: string) {
  return one<{ id: number; data: Site["collections"][number] }>("SELECT id, data FROM collections WHERE site_id = $1 AND slug = $2", [siteId, slug]);
}

export async function saveCollection(siteId: string, originalSlug: string | null, input: unknown): Promise<Result<string>> {
  const parsed = CollectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const c = parsed.data;
  if (c.slug === "new") return fail("This address is reserved; choose another", ["slug"]);
  const svc = await one<{ services: Site["services"] }>("SELECT services FROM sites WHERE id = $1", [siteId]);
  if (!svc?.services.some((s) => s.slug === c.service)) return fail("Choose one of your services", ["service"]);
  const clash = await one("SELECT 1 FROM collections WHERE site_id = $1 AND slug = $2 AND slug <> coalesce($3, '')", [siteId, c.slug, originalSlug]);
  if (clash) return fail("Another category already uses this address", ["slug"]);
  await tx(async (t) => {
    if (originalSlug) {
      await t.query("UPDATE collections SET slug = $1, data = $2 WHERE site_id = $3 AND slug = $4", [c.slug, json(c), siteId, originalSlug]);
      if (originalSlug !== c.slug) {
        // Products follow their category; old URLs redirect to the new ones.
        const prods = await t.query<{ slug: string; data: Site["products"][number] }>("SELECT slug, data FROM products WHERE site_id = $1 AND collection = $2", [siteId, originalSlug]);
        for (const p of prods.rows) {
          await t.query("UPDATE products SET collection = $1, data = $2 WHERE site_id = $3 AND slug = $4", [c.slug, json({ ...p.data, collection: c.slug }), siteId, p.slug]);
          await addRedirect(t, siteId, `/products/${originalSlug}/${p.slug}`, `/products/${c.slug}/${p.slug}`);
        }
        await addRedirect(t, siteId, `/products/${originalSlug}`, `/products/${c.slug}`);
        await rewriteCategoryRefs(t, siteId, originalSlug, c.slug);
      }
    } else {
      await t.query("INSERT INTO collections (site_id, slug, position, data) VALUES ($1,$2,(SELECT coalesce(max(position),0)+1 FROM collections WHERE site_id=$1),$3)", [siteId, c.slug, json(c)]);
    }
  });
  await touch(siteId);
  return { ok: true, value: c.slug };
}

export async function deleteCollection(siteId: string, slug: string): Promise<Result> {
  const n = await one<{ n: number }>("SELECT count(*)::int AS n FROM products WHERE site_id = $1 AND collection = $2", [siteId, slug]);
  if (n && n.n > 0) return fail(`Move or delete its ${n.n} products first`);
  await tx(async (t) => {
    await t.query("DELETE FROM collections WHERE site_id = $1 AND slug = $2", [siteId, slug]);
    await rewriteCategoryRefs(t, siteId, slug, null);
    await addRedirect(t, siteId, `/products/${slug}`, "/products");
  });
  await touch(siteId);
  return { ok: true };
}

/** Keep category tiles and product grids pointing at the right category after a rename or delete. */
async function rewriteCategoryRefs(t: Queryable, siteId: string, from: string, to: string | null) {
  const rows = (await t.query<{ id: number; data: Block }>("SELECT s.id, s.data FROM sections s JOIN pages p ON p.id = s.page_id WHERE p.site_id = $1 AND s.type IN ('category_tiles','product_grid')", [siteId])).rows;
  for (const r of rows) {
    const b = r.data;
    let changed = false;
    if (b.type === "category_tiles" && b.categories.includes(from)) {
      b.categories = to ? b.categories.map((c) => (c === from ? to : c)) : b.categories.filter((c) => c !== from);
      changed = true;
    }
    if (b.type === "product_grid" && b.source.kind === "collection" && b.source.collection === from) {
      b.source = to ? { kind: "collection", collection: to } : { kind: "featured" };
      changed = true;
    }
    if (changed) await t.query("UPDATE sections SET data = $1 WHERE id = $2", [json(b), r.id]);
  }
}

// ---------- redirects ----------

async function addRedirect(t: Queryable, siteId: string, from: string, to: string) {
  if (from === to) return;
  // A new redirect replaces any older one from the same path, and chains are flattened.
  await t.query("DELETE FROM redirects WHERE site_id = $1 AND from_path = $2", [siteId, to]);
  await t.query("UPDATE redirects SET to_path = $3 WHERE site_id = $1 AND to_path = $2", [siteId, from, to]);
  await t.query(
    "INSERT INTO redirects (site_id, from_path, to_path, code) VALUES ($1,$2,$3,301) ON CONFLICT (site_id, from_path) DO UPDATE SET to_path = EXCLUDED.to_path",
    [siteId, from, to]
  );
}

export async function listRedirects(siteId: string) {
  return q<{ from_path: string; to_path: string; created_at: string }>("SELECT from_path, to_path, created_at FROM redirects WHERE site_id = $1 ORDER BY created_at DESC", [siteId]);
}
