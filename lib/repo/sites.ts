import { json, one, q, tx, type Queryable } from "@/db/client";
import type { Block } from "@/schema/blocks";
import type { Site } from "@/schema/site";
import { validateSite, type Issue } from "@/schema/validate";

/**
 * Site content lives in tables while it is being edited (the "draft").
 * Publishing assembles the draft into one Site object, validates it, and stores it as a version.
 * Visitors only ever see the latest published version.
 */

type SiteRow = {
  id: string; name: string; status: string; company: Site["company"]; theme: Site["theme"]; services: Site["services"];
  globals: Site["globals"]; templates: Site["templates"]; default_ctas: Site["defaultCtas"]; settings: SiteSettings; updated_at: string;
};
export type SiteSettings = { crmWebhookUrl?: string; allowAiCrawlers?: boolean; gscProperty?: string };

/** A hidden block keeps its place in the editor but is left out of the published site. */
export type HiddenBlock = { page: string; index: number; block: Block };
export type Snapshot = { site: Site; hidden: HiddenBlock[] };

export async function listSites() {
  return q<{ id: string; name: string; status: string; updated_at: string }>("SELECT id, name, status, updated_at FROM sites ORDER BY name");
}

export async function getSiteRow(id: string) {
  return one<SiteRow>("SELECT * FROM sites WHERE id = $1", [id]);
}

/** Assemble the draft. `includeHidden` is for the editor; publishing leaves hidden blocks out. */
export async function assembleDraft(siteId: string): Promise<Snapshot | null> {
  const s = await getSiteRow(siteId);
  if (!s) return null;
  const pages = await q<{ id: number; slug: string; template: string; name: string; seo: Site["pages"][number]["seo"] }>(
    "SELECT id, slug, template, name, seo FROM pages WHERE site_id = $1 ORDER BY position, id", [siteId]);
  const sections = await q<{ page_id: number; position: number; visible: boolean; data: Block }>(
    "SELECT s.page_id, s.position, s.visible, s.data FROM sections s JOIN pages p ON p.id = s.page_id WHERE p.site_id = $1 ORDER BY s.page_id, s.position", [siteId]);
  const collections = await q<{ data: Site["collections"][number] }>("SELECT data FROM collections WHERE site_id = $1 ORDER BY position, id", [siteId]);
  const products = await q<{ data: Site["products"][number] }>("SELECT data FROM products WHERE site_id = $1 ORDER BY position, id", [siteId]);

  const hidden: HiddenBlock[] = [];
  const site: Site = {
    version: 1,
    company: s.company,
    theme: s.theme,
    services: s.services,
    globals: s.globals,
    templates: s.templates,
    defaultCtas: s.default_ctas,
    pages: pages.map((p) => {
      const own = sections.filter((x) => x.page_id === p.id);
      own.forEach((x, index) => { if (!x.visible) hidden.push({ page: p.slug, index, block: x.data }); });
      return { slug: p.slug, template: p.template as Site["pages"][number]["template"], name: p.name, seo: p.seo, sections: own.filter((x) => x.visible).map((x) => x.data) };
    }),
    collections: collections.map((c) => c.data),
    products: products.map((p) => p.data),
  };
  return { site, hidden };
}

/** Replace a site's whole draft with a snapshot (used by import, AI generation and rollback). */
export async function writeDraft(siteId: string, snap: Snapshot, t?: Queryable) {
  const run = async (d: Queryable) => {
    const { site } = snap;
    await d.query(
      `INSERT INTO sites (id, name, company, theme, services, globals, templates, default_ctas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, company=EXCLUDED.company, theme=EXCLUDED.theme, services=EXCLUDED.services,
         globals=EXCLUDED.globals, templates=EXCLUDED.templates, default_ctas=EXCLUDED.default_ctas, updated_at=now()`,
      [siteId, site.company.brandName, json(site.company), json(site.theme), json(site.services), json(site.globals), json(site.templates), json(site.defaultCtas)]
    );
    await d.query("DELETE FROM pages WHERE site_id = $1", [siteId]);
    await d.query("DELETE FROM collections WHERE site_id = $1", [siteId]);
    await d.query("DELETE FROM products WHERE site_id = $1", [siteId]);
    for (const [pi, p] of site.pages.entries()) {
      const { rows } = await d.query<{ id: number }>(
        "INSERT INTO pages (site_id, slug, template, name, seo, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
        [siteId, p.slug, p.template, p.name, json(p.seo), pi]
      );
      // Re-insert hidden blocks at their original positions.
      const blocks: { block: Block; visible: boolean }[] = p.sections.map((b) => ({ block: b, visible: true }));
      for (const h of snap.hidden.filter((h) => h.page === p.slug).sort((a, b) => a.index - b.index)) {
        blocks.splice(Math.min(h.index, blocks.length), 0, { block: h.block, visible: false });
      }
      for (const [i, b] of blocks.entries()) {
        await d.query("INSERT INTO sections (page_id, block_id, type, position, visible, data) VALUES ($1,$2,$3,$4,$5,$6)",
          [rows[0].id, b.block.id, b.block.type, i, b.visible, json(b.block)]);
      }
    }
    for (const [i, c] of site.collections.entries())
      await d.query("INSERT INTO collections (site_id, slug, position, data) VALUES ($1,$2,$3,$4)", [siteId, c.slug, i, json(c)]);
    for (const [i, p] of site.products.entries())
      await d.query("INSERT INTO products (site_id, slug, collection, position, data) VALUES ($1,$2,$3,$4,$5)", [siteId, p.slug, p.collection, i, json(p)]);
  };
  return t ? run(t) : tx(run);
}

// ---------- publishing ----------

export async function publish(siteId: string, author: string, note = "", kind = "publish"): Promise<{ ok: true; versionId: number; versionNumber: number; warnings: Issue[] } | { ok: false; issues: Issue[] }> {
  const draft = await assembleDraft(siteId);
  if (!draft) return { ok: false, issues: [{ level: "error", where: "site", message: "Site not found" }] };
  const { site, issues } = validateSite(draft.site);
  const errors = issues.filter((i) => i.level === "error");
  if (!site || errors.length) return { ok: false, issues: errors };
  const snap: Snapshot = { site, hidden: draft.hidden };
  const row = await one<{ id: number }>(
    "INSERT INTO site_versions (site_id, snapshot, note, author, kind) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [siteId, json(snap), note, author, kind]
  );
  await q("UPDATE sites SET status = CASE WHEN status = 'suspended' THEN status ELSE 'live' END, updated_at = now() WHERE id = $1", [siteId]);
  const n = await one<{ n: number }>("SELECT count(*)::int AS n FROM site_versions WHERE site_id = $1", [siteId]);
  return { ok: true, versionId: row!.id, versionNumber: n!.n, warnings: issues.filter((i) => i.level === "warning") };
}

// `number` counts this site's versions (1, 2, 3 …); `id` is the database key used for restores.
const NUMBER = "(SELECT count(*)::int FROM site_versions v2 WHERE v2.site_id = v.site_id AND v2.id <= v.id) AS number";

export async function latestPublished(siteId: string): Promise<{ id: number; number: number; site: Site; created_at: string } | null> {
  const r = await one<{ id: number; number: number; snapshot: Snapshot; created_at: string }>(
    `SELECT v.id, ${NUMBER}, v.snapshot, v.created_at FROM site_versions v WHERE v.site_id = $1 ORDER BY v.id DESC LIMIT 1`, [siteId]);
  return r ? { id: r.id, number: r.number, site: r.snapshot.site, created_at: r.created_at } : null;
}

export async function listVersions(siteId: string) {
  return q<{ id: number; number: number; note: string; author: string; kind: string; created_at: string }>(
    `SELECT v.id, ${NUMBER}, v.note, v.author, v.kind, v.created_at FROM site_versions v WHERE v.site_id = $1 ORDER BY v.id DESC LIMIT 50`, [siteId]);
}

/** Roll back: copy an old version into the draft and publish it as a new version. */
export async function restoreVersion(siteId: string, versionId: number, author: string) {
  const v = await one<{ snapshot: Snapshot }>("SELECT snapshot FROM site_versions WHERE site_id = $1 AND id = $2", [siteId, versionId]);
  if (!v) return { ok: false as const, issues: [{ level: "error" as const, where: "version", message: "Version not found" }] };
  const n = await one<{ n: number }>("SELECT count(*)::int AS n FROM site_versions WHERE site_id = $1 AND id <= $2", [siteId, versionId]);
  await writeDraft(siteId, v.snapshot);
  return publish(siteId, author, `Restored version ${n?.n ?? versionId}`, "restore");
}

/** True when the draft differs from what visitors see. */
export async function hasUnpublishedChanges(siteId: string) {
  const [draft, live] = await Promise.all([assembleDraft(siteId), one<{ snapshot: Snapshot }>("SELECT snapshot FROM site_versions WHERE site_id=$1 ORDER BY id DESC LIMIT 1", [siteId])]);
  if (!draft || !live) return true;
  // The site address follows the primary domain live (see site-runtime), so it is not a "change to publish".
  const norm = (s: Snapshot) => {
    const v = validateSite(s.site).site ?? s.site;
    return JSON.stringify({ ...v, company: { ...v.company, siteUrl: "" } }) + JSON.stringify(s.hidden);
  };
  return norm(draft) !== norm(live.snapshot);
}

// ---------- domains ----------

export async function siteIdForHost(host: string): Promise<string | null> {
  const h = host.toLowerCase().split(":")[0];
  // Custom domains are served only after their owner proved control of the DNS.
  const r = await one<{ site_id: string }>("SELECT site_id FROM domains WHERE hostname = $1 AND verified_at IS NOT NULL", [h]);
  return r?.site_id ?? null;
}
