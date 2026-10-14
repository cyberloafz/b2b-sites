"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser, requireSite } from "@/lib/auth/session";
import { QuestionnaireSchema } from "@/schema/questionnaire";
import { IMPORT_FIELDS, guessMapping, parseSheet, type Mapping } from "@/lib/repo/import";
import { storeLogo } from "@/lib/ai/brand";
import { confirmPlan, getGeneration, retryJob, startSite, updateMapping } from "@/lib/ai/pipeline";
import { q } from "@/db/client";
import { enqueue, runJobs } from "@/lib/jobs";

export type StartState = { error?: string; fields?: Record<string, string>; values?: Record<string, string> };

const lines = (s: FormDataEntryValue | null, commas = false) => String(s ?? "").split(commas ? /[\n,]/ : /\n/).map((x) => x.trim()).filter(Boolean);
const opt = (s: FormDataEntryValue | null) => (String(s ?? "").trim() ? String(s).trim() : undefined);

/** Step 1: questionnaire + files → new site + plan. Generation of copy starts only after the plan is confirmed. */
export async function startGenerationAction(_prev: StartState, form: FormData): Promise<StartState> {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  const values = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;

  const raw = {
    legalName: form.get("legalName"), brandName: form.get("brandName"), websiteUrl: form.get("websiteUrl"),
    foundedYear: opt(form.get("foundedYear")), street: form.get("street"), city: form.get("city"), state: form.get("state"),
    zip: form.get("zip"), phone: form.get("phone"), email: form.get("email"), inquiryEmail: opt(form.get("inquiryEmail")) ?? form.get("email"),
    industry: form.get("industry"), whatYouMake: form.get("whatYouMake"),
    services: [0, 1, 2, 3].map((i) => ({ name: opt(form.get(`service${i}Name`)), description: opt(form.get(`service${i}Desc`)) })).filter((s) => s.name || s.description),
    audience: form.get("audience"),
    certifications: lines(form.get("certifications")), differentiators: lines(form.get("differentiators")),
    keywords: lines(form.get("keywords"), true),
    minimumOrder: opt(form.get("minimumOrder")), leadTime: opt(form.get("leadTime")), capacity: opt(form.get("capacity")),
    testimonials: [0, 1, 2].map((i) => ({ quote: opt(form.get(`t${i}Quote`)), name: opt(form.get(`t${i}Name`)), company: opt(form.get(`t${i}Company`)) })).filter((t) => t.quote || t.name),
    tone: form.get("tone") ?? undefined, stylePack: form.get("stylePack") ?? undefined,
  };
  const parsed = QuestionnaireSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const [a, b, c] = i.path;
      const key = a === "services" ? `service${String(b)}${c === "description" ? "Desc" : "Name"}` : a === "testimonials" ? `t${String(b)}${c === "quote" ? "Quote" : c === "name" ? "Name" : "Company"}` : String(a);
      fields[key] ??= i.message;
    }
    return { error: "Please fix the highlighted fields.", fields, values };
  }

  let sheet = null;
  const sheetFile = form.get("sheet");
  if (sheetFile instanceof File && sheetFile.size > 0) {
    const s = await parseSheet(sheetFile);
    if (!s.ok) return { error: s.error, fields: { sheet: s.error }, values };
    sheet = { headers: s.headers, rows: s.rows, mapping: guessMapping(s.headers) };
  }
  const logoFile = form.get("logo");
  const res = await startSite({
    userId: user.id,
    questionnaire: parsed.data,
    sheet,
    logo: async (siteId) => {
      if (!(logoFile instanceof File) || logoFile.size === 0) return { ok: true, logo: null };
      const r = await storeLogo(siteId, logoFile);
      return r.ok ? { ok: true, logo: { src: r.src, width: r.width, height: r.height, color: r.color } } : { ok: false, error: r.error };
    },
  });
  if (!res.ok) return { error: res.error, fields: { logo: res.error }, values };
  redirect(`/admin/new/${res.siteId}/plan`);
}

/** Plan screen: the user corrects which spreadsheet column is which; categories are re-read and the plan redone. */
export async function saveMappingAction(siteId: string, form: FormData) {
  await requireSite(siteId, "owner");
  const mapping: Mapping = {};
  for (const f of IMPORT_FIELDS) {
    const v = String(form.get(`map_${f.key}`) ?? "");
    if (v !== "") mapping[f.key] = Number(v);
  }
  await updateMapping(siteId, mapping);
  revalidatePath(`/admin/new/${siteId}/plan`);
}

/** Plan screen: confirm → write the site. Runs after the response, so the browser can show progress. */
export async function confirmPlanAction(siteId: string, form: FormData) {
  await requireSite(siteId, "owner");
  const all = form.getAll("page").map(String);
  const keep = new Set(form.getAll("keep").map(String));
  const services: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (k.startsWith("svc_")) services[k.slice(4)] = String(v);
  const r = await confirmPlan(siteId, { dropPages: all.filter((p) => !keep.has(p)), services });
  if (!r.ok) throw new Error(r.error);
  // Durable: if this server stops mid-way, the cron job resumes the generation.
  await enqueue("generate-site", { siteId }, { dedupe: true });
  after(() => runJobs());
  redirect(`/admin/new/${siteId}/progress`);
}

export async function retryJobAction(siteId: string, jobId: number) {
  await requireSite(siteId, "owner");
  const r = await retryJob(siteId, jobId);
  revalidatePath(`/admin/new/${siteId}/progress`);
  return r;
}

/** Writes the whole draft again from the confirmed plan (replaces any edits made since). */
export async function regenerateAction(siteId: string) {
  await requireSite(siteId, "owner");
  const gen = await getGeneration(siteId);
  if (!gen?.plan || gen.status === "generating") return;
  await q("UPDATE site_generations SET status = 'generating', error = NULL, updated_at = now() WHERE site_id = $1", [siteId]);
  await enqueue("generate-site", { siteId }, { dedupe: true });
  after(() => runJobs());
  redirect(`/admin/new/${siteId}/progress`);
}
