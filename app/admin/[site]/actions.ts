"use server";

import { revalidatePath } from "next/cache";
import { requireSite } from "@/lib/auth/session";
import * as ed from "@/lib/repo/editor";
import { uploadMedia, setMediaAlt } from "@/lib/repo/media";
import { assembleDraft, publish, restoreVersion } from "@/lib/repo/sites";
import { validateSite } from "@/schema/validate";
import { runSeoCheck } from "@/lib/seo-check";
import { submitSitemap } from "@/lib/search-console";
import { siteChanged } from "@/lib/site-runtime";
import type { BlockType } from "@/schema/blocks";
import { guessMapping, importProducts, parseSheet, type Mapping } from "@/lib/repo/import";
import { setInquiryStatus } from "@/lib/repo/inquiries";
import * as rd from "@/lib/repo/redirects";
import { confirmLegalPages } from "@/lib/legal";

/**
 * Admin server actions. Each one re-checks the session and the user's role for this site:
 * the browser is never trusted to say who it is or which site it may change.
 */

const after = (siteId: string) => revalidatePath(`/admin/${siteId}`, "layout");

export async function saveBlockAction(siteId: string, sectionId: number, value: unknown) {
  await requireSite(siteId);
  const r = await ed.saveBlock(siteId, sectionId, value);
  if (r.ok) after(siteId);
  return r;
}

export async function addBlockAction(siteId: string, pageId: number, type: BlockType, afterPosition: number) {
  await requireSite(siteId);
  const r = await ed.addBlock(siteId, pageId, type, afterPosition);
  after(siteId);
  return r;
}

export async function blockOpAction(siteId: string, sectionId: number, op: "up" | "down" | "show" | "hide" | "delete" | "duplicate", position = 0) {
  await requireSite(siteId);
  const r =
    op === "up" ? await ed.moveBlock(siteId, sectionId, position - 1)
    : op === "down" ? await ed.moveBlock(siteId, sectionId, position + 1)
    : op === "show" ? await ed.setBlockVisible(siteId, sectionId, true)
    : op === "hide" ? await ed.setBlockVisible(siteId, sectionId, false)
    : op === "delete" ? await ed.deleteBlock(siteId, sectionId)
    : await ed.duplicateBlock(siteId, sectionId);
  after(siteId);
  return r;
}

export async function moveBlockToAction(siteId: string, sectionId: number, to: number) {
  await requireSite(siteId);
  const r = await ed.moveBlock(siteId, sectionId, to);
  after(siteId);
  return r;
}

export async function savePageSettingsAction(siteId: string, pageId: number, value: unknown) {
  await requireSite(siteId);
  const r = await ed.savePageSettings(siteId, pageId, value);
  if (r.ok) after(siteId);
  return r;
}

export async function createPageAction(siteId: string, name: string, slug: string) {
  await requireSite(siteId);
  const r = await ed.createPage(siteId, { name, slug });
  after(siteId);
  return r;
}

export async function deletePageAction(siteId: string, pageId: number) {
  await requireSite(siteId, "owner");
  const r = await ed.deletePage(siteId, pageId);
  after(siteId);
  return r;
}

export async function saveGlobalAction(siteId: string, key: "announcement" | "header" | "footer", value: unknown | null) {
  await requireSite(siteId);
  const r = await ed.saveGlobal(siteId, key, value);
  if (r.ok) after(siteId);
  return r;
}

export async function saveThemeAction(siteId: string, value: unknown) {
  await requireSite(siteId, "owner");
  const r = await ed.saveTheme(siteId, value);
  if (r.ok) after(siteId);
  return r;
}

export async function saveCompanyAction(siteId: string, value: unknown) {
  await requireSite(siteId, "owner");
  const r = await ed.saveCompany(siteId, value);
  if (r.ok) after(siteId);
  return r;
}

export async function saveServicesAction(siteId: string, value: { services: unknown }) {
  await requireSite(siteId, "owner");
  const r = await ed.saveServices(siteId, value.services);
  if (!r.ok) return { ok: false as const, errors: r.errors.map((e) => ({ ...e, path: ["services", ...e.path] })) };
  after(siteId);
  return r;
}

export async function saveSettingsAction(siteId: string, value: { crmWebhookUrl?: string; allowAiCrawlers?: boolean; gscProperty?: string }) {
  await requireSite(siteId, "owner");
  const r = await ed.saveSettings(siteId, value);
  if (r.ok) after(siteId);
  return r;
}

export async function saveProductAction(siteId: string, originalSlug: string | null, value: unknown) {
  await requireSite(siteId);
  const r = await ed.saveProduct(siteId, originalSlug, value);
  if (r.ok) after(siteId);
  return r;
}

export async function deleteProductAction(siteId: string, slug: string) {
  await requireSite(siteId);
  const r = await ed.deleteProduct(siteId, slug);
  after(siteId);
  return r;
}

export async function saveCollectionAction(siteId: string, originalSlug: string | null, value: unknown) {
  await requireSite(siteId);
  const r = await ed.saveCollection(siteId, originalSlug, value);
  if (r.ok) after(siteId);
  return r;
}

export async function deleteCollectionAction(siteId: string, slug: string) {
  await requireSite(siteId);
  const r = await ed.deleteCollection(siteId, slug);
  after(siteId);
  return r;
}

export async function uploadMediaAction(siteId: string, fd: FormData) {
  await requireSite(siteId);
  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "Choose a file to upload." };
  const r = await uploadMedia(siteId, file, String(fd.get("alt") ?? ""));
  if (!r.ok) return r;
  after(siteId);
  const m = r.media;
  return { ok: true as const, media: { url: m.url, alt: m.alt, width: m.width, height: m.height } };
}

export async function setMediaAltAction(siteId: string, id: string, alt: string) {
  await requireSite(siteId);
  await setMediaAlt(siteId, id, alt);
  after(siteId);
}

export async function publishAction(siteId: string, note: string) {
  const { user } = await requireSite(siteId);
  // 1. Content rules (schema, placeholders, references) — cheap, run first.
  const draft = await assembleDraft(siteId);
  const errors = validateSite(draft!.site).issues.filter((i) => i.level === "error");
  if (errors.length) return { ok: false as const, issues: errors, stage: "content" as const };
  // 2. SEO / accessibility check on the rendered draft — errors block publishing.
  const seo = await runSeoCheck(siteId);
  if (seo.errors) {
    after(siteId);
    return { ok: false as const, issues: seo.findings.filter((f) => f.level === "error").map((f) => ({ level: "error" as const, where: f.path, message: f.message })), stage: "seo" as const };
  }
  const r = await publish(siteId, user.email, note.slice(0, 200));
  if (r.ok) {
    siteChanged(siteId);
    await submitSitemap(siteId).catch(() => undefined); // best effort; outcome is logged
  }
  after(siteId);
  return r;
}

export async function runSeoCheckAction(siteId: string) {
  await requireSite(siteId);
  const r = await runSeoCheck(siteId);
  after(siteId);
  return { errors: r.errors, warnings: r.warnings };
}

export async function restoreAction(siteId: string, versionId: number) {
  const { user } = await requireSite(siteId, "owner");
  const r = await restoreVersion(siteId, versionId, user.email);
  if (r.ok) siteChanged(siteId);
  after(siteId);
  return r;
}

// ---------- spreadsheet import ----------

export async function parseSheetAction(siteId: string, fd: FormData) {
  await requireSite(siteId);
  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "Choose a file." };
  const r = await parseSheet(file);
  if (!r.ok) return r;
  return { ...r, mapping: guessMapping(r.headers) };
}

export async function importProductsAction(siteId: string, headers: string[], rows: string[][], mapping: Mapping) {
  await requireSite(siteId);
  const r = await importProducts(siteId, headers, rows, mapping);
  after(siteId);
  return r;
}

// ---------- inquiries ----------
export async function setInquiryStatusAction(siteId: string, id: number, status: string) {
  await requireSite(siteId);
  await setInquiryStatus(siteId, id, status);
  after(siteId);
}

// ---------- redirects & 404s ----------
export async function addRedirectAction(siteId: string, from: string, to: string) {
  await requireSite(siteId);
  const r = await rd.addRedirect(siteId, from, to);
  after(siteId);
  return r;
}

export async function deleteRedirectAction(siteId: string, from: string) {
  await requireSite(siteId);
  await rd.deleteRedirect(siteId, from);
  after(siteId);
  return { ok: true as const };
}

export async function dismiss404Action(siteId: string, path: string) {
  await requireSite(siteId);
  await rd.dismiss404(siteId, path);
  after(siteId);
  return { ok: true as const };
}

/** Owner confirms the legal pages were reviewed: removes the sample notices and records who and when. */
export async function confirmLegalAction(siteId: string) {
  const { user } = await requireSite(siteId, "owner");
  const r = await confirmLegalPages(siteId, `${user.name} <${user.email}>`);
  after(siteId);
  return r;
}
