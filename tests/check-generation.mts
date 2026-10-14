/**
 * Phase 4 smoke test without the web server: questionnaire + product sheet → plan → full draft,
 * using the mock model (AI_PROVIDER=mock). Run: npm run test:generation
 */
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { QuestionnaireSchema } from "../schema/questionnaire";
import { startSite, confirmPlan, runGeneration, getGeneration, listJobs } from "../lib/ai/pipeline";
import { guessMapping } from "../lib/repo/import";
import { assembleDraft } from "../lib/repo/sites";
import { validateSite } from "../schema/validate";
import { one } from "../db/client";
import { hashPassword } from "../lib/auth/password";

async function main() {
  process.env.AI_PROVIDER = "mock";
  const qn = QuestionnaireSchema.parse(JSON.parse(readFileSync("tests/fixtures/prairie-questionnaire.json", "utf8")));
  const [headers, ...rows] = Papa.parse<string[]>(readFileSync("tests/fixtures/prairie-products.csv", "utf8"), { skipEmptyLines: "greedy" }).data;
  const user = await one<{ id: number }>("INSERT INTO users (email, name, password_hash) VALUES ($1,'T',$2) ON CONFLICT (email) DO UPDATE SET name='T' RETURNING id", ["gen-test@example.com", hashPassword("x")]);
  const res = await startSite({ userId: user!.id, questionnaire: qn, sheet: { headers, rows, mapping: guessMapping(headers) }, logo: async () => ({ ok: true, logo: null }) });
  if (!res.ok) throw new Error(res.error);
  const gen = await getGeneration(res.siteId);
  console.log("site", res.siteId, "status", gen!.status, gen!.brand_note);
  await confirmPlan(res.siteId, { dropPages: [], services: {} });
  await runGeneration(res.siteId);
  const after = await getGeneration(res.siteId);
  const jobs = await listJobs(res.siteId);
  for (const j of jobs.filter((j) => j.status !== "done")) console.log("JOB", j.step, j.target, j.status, j.error);
  const draft = await assembleDraft(res.siteId);
  const { issues } = validateSite(draft!.site);
  for (const i of issues.filter((x) => !x.message.startsWith("This is sample legal text"))) console.log(i.level, i.where, i.message);
  const checks: [string, boolean][] = [
    ["generation finished", after!.status === "done"],
    ["no failed jobs", jobs.every((j) => j.status === "done")],
    ["9 products imported", after!.summary?.products.created === 9],
    ["3 categories with intros", draft!.site.collections.length === 3 && draft!.site.collections.every((c) => !c.intro.includes("[[TODO"))],
    ["every page has a title and description", draft!.site.pages.every((p) => p.seo.title && p.seo.description)],
    ["page titles unique", new Set(draft!.site.pages.map((p) => p.seo.title)).size === draft!.site.pages.length],
    ["legal pages wait for the owner's review (3 sample-text errors)", issues.filter((i) => i.message.startsWith("This is sample legal text")).length === 3],
    ["no other errors or warnings", issues.filter((i) => !i.message.startsWith("This is sample legal text")).length === 0],
  ];
  for (const [n, ok] of checks) console.log((ok ? "PASS " : "FAIL ") + n);
  process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
