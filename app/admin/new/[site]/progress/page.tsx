import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSite } from "@/lib/auth/session";
import { getGeneration, listJobs } from "@/lib/ai/pipeline";
import { q } from "@/db/client";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { RetryButton } from "@/components/admin/RetryButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { regenerateAction } from "../../actions";
import { jobFor } from "@/lib/jobs";

export const metadata = { title: "Generating your site" };
export const maxDuration = 300; // the background generation runs after this page's actions respond

const STEP_LABEL: Record<string, string> = {
  plan: "Site plan", skeleton: "Pages and navigation", products: "Products from your spreadsheet",
  block: "Page sections", intro: "Category introductions", seo: "Page titles and descriptions",
};

/** Turns a validation location (pages[/about].hero, products.x, …) into the admin screen that fixes it. */
async function editLinks(siteId: string) {
  const pages = await q<{ id: number; slug: string }>("SELECT id, slug FROM pages WHERE site_id = $1", [siteId]);
  const sections = await q<{ id: number; page_id: number; block_id: string }>(
    "SELECT s.id, s.page_id, s.block_id FROM sections s JOIN pages p ON p.id = s.page_id WHERE p.site_id = $1", [siteId]);
  const base = `/admin/${siteId}`;
  return (where: string) => {
    const m = where.match(/^pages\[(.+?)\]\.?(.*)$/);
    if (m) {
      const page = pages.find((p) => p.slug === m[1]);
      const s = page && sections.find((x) => x.page_id === page.id && x.block_id === m[2]);
      return page ? `${base}/pages/${page.id}${s ? `?block=${s.id}` : ""}` : undefined;
    }
    const [kind, slug] = where.split(".");
    if (kind === "products") return `${base}/products/${slug}`;
    if (kind === "collections") return `${base}/categories/${slug}`;
    if (kind === "company") return `${base}/company`;
    if (kind === "globals") return `${base}/site`;
    return undefined;
  };
}

export default async function ProgressPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  await requireSite(siteId, "owner");
  const gen = await getGeneration(siteId);
  if (!gen) redirect(`/admin/${siteId}`);
  if (gen.status === "planning" || gen.status === "plan_ready") redirect(`/admin/new/${siteId}/plan`);
  const jobs = await listJobs(siteId);
  const queued = await jobFor("generate-site", { siteId });
  const running = gen.status === "generating";
  const steps = ["skeleton", "products", "block", "intro", "seo"].map((step) => {
    const js = jobs.filter((j) => j.step === step);
    return { step, total: js.length, done: js.filter((j) => j.status === "done").length, failed: js.filter((j) => j.status === "failed").length, running: js.filter((j) => j.status === "running").length };
  }).filter((s) => s.total > 0);
  const failed = jobs.filter((j) => j.status === "failed");
  const s = gen.summary;
  const link = gen.status === "done" ? await editLinks(siteId) : () => undefined;

  return (
    <main className="a-page narrow-page">
      <AutoRefresh active={running} />
      <p><Link href="/admin">← Your sites</Link></p>
      <h1>{running ? `Writing ${gen.questionnaire.brandName}…` : gen.status === "done" ? `${gen.questionnaire.brandName} is ready to review` : "Generation stopped"}</h1>
      <p className="muted" role="status" aria-live="polite">
        {running ? (queued?.status === "queued" ? (queued.attempts > 0 ? "Generation was interrupted and will restart in a moment…" : "Waiting to start…")
          : "You can leave this page; generation continues in the background.") :
          gen.status === "done" ? `Written by ${gen.provider === "mock" ? "the demo template writer (no AI model connected)" : "the AI model"}. Nothing is public until you publish.` :
          gen.error}
      </p>

      <section className="card">
        <h2>Progress</h2>
        {!steps.length && <p className="muted">Starting…</p>}
        <ul className="steps">
          {steps.map((st) => (
            <li key={st.step}>
              <span className="grow">{STEP_LABEL[st.step]}</span>
              <progress max={st.total} value={st.done + st.failed} aria-label={STEP_LABEL[st.step]} />
              <span className="small">{st.done}/{st.total}{st.failed ? ` · ${st.failed} failed` : ""}</span>
            </li>
          ))}
        </ul>
      </section>

      {failed.length > 0 && !running && (
        <section className="card">
          <h2>Steps that need another try ({failed.length})</h2>
          <p className="hint">The section keeps a marked placeholder until it is written. Retry, or fill it in yourself in the editor.</p>
          <table className="list">
            <tbody>
              {failed.map((j) => (
                <tr key={j.id}>
                  <td>{STEP_LABEL[j.step] ?? j.step}<br /><code className="small">{j.target}</code></td>
                  <td className="small">{j.error}</td>
                  <td>{["block", "intro", "seo"].includes(j.step) && <RetryButton siteId={siteId} jobId={j.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {gen.status === "done" && s && (
        <section className="card">
          <h2>Summary</h2>
          <div className="cards">
            <div className="card"><div className="stat-n">{s.pages}</div>pages</div>
            <div className="card"><div className="stat-n">{s.aiBlocks}</div>sections written</div>
            <div className="card"><div className="stat-n">{s.products.created}</div>products imported</div>
            <div className="card"><div className="stat-n">{s.todos.length}</div>placeholders to fill</div>
          </div>
          {s.products.failed.length > 0 && (
            <>
              <h3>Spreadsheet rows not imported</h3>
              <ul>{s.products.failed.map((f) => <li key={f.row}>Row {f.row} ({f.name}): {f.message}</li>)}</ul>
            </>
          )}
          {s.todos.length > 0 && (
            <>
              <h3>Fill these in before publishing</h3>
              <p className="hint">The AI left these because your answers did not contain the fact. Publishing is blocked until they are replaced.</p>
              <ul className="issues">
                {s.todos.map((t, i) => {
                  const href = link(t.where);
                  return <li key={i}>{href ? <Link href={href}>{t.where}</Link> : t.where}: {t.message}</li>;
                })}
              </ul>
            </>
          )}
          {s.errors.length > 0 && (
            <ul className="issues">{s.errors.map((t, i) => <li key={i}>{t.where}: {t.message}</li>)}</ul>
          )}
          <div className="row">
            <a className="btn" href={`/preview/${siteId}`} target="_blank" rel="noopener">Preview the site</a>
            <Link className="btn" href={`/admin/${siteId}/pages`}>Edit pages</Link>
            <Link className="btn primary" href={`/admin/${siteId}/publish`}>Review &amp; publish</Link>
          </div>
        </section>
      )}

      {!running && (
        <section className="card">
          <h2>Start over</h2>
          <p className="hint">Writes the whole site again from the confirmed plan. Edits made in the editor since then are replaced.</p>
          <ConfirmButton label="Generate again" confirmLabel="Yes, replace the draft" action={regenerateAction.bind(null, siteId)} />
        </section>
      )}
    </main>
  );
}
