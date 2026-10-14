import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSite } from "@/lib/auth/session";
import { getGeneration, serviceSlugs, sheetCategories } from "@/lib/ai/pipeline";
import { IMPORT_FIELDS } from "@/lib/repo/import";
import { BLOCK_LABELS } from "@/lib/block-defaults";
import { getSiteRow } from "@/lib/repo/sites";
import { confirmPlanAction, saveMappingAction } from "../../actions";

export const metadata = { title: "Review the plan" };
export const maxDuration = 300; // "Generate" starts the work right after responding

const REQUIRED = new Set(["/", "/contact", "/thank-you", "/privacy", "/terms", "/accessibility"]);

export default async function PlanPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  await requireSite(siteId, "owner");
  const gen = await getGeneration(siteId);
  if (!gen) redirect(`/admin/${siteId}`);
  if (gen.status === "generating" || gen.status === "done") redirect(`/admin/new/${siteId}/progress`);
  const plan = gen.plan;
  const row = await getSiteRow(siteId);
  const qn = gen.questionnaire;
  const slugs = serviceSlugs(qn);
  const cats = sheetCategories(gen.sheet);

  return (
    <main className="a-page narrow-page">
      <p><Link href="/admin">← Your sites</Link></p>
      <h1>Review the plan for {qn.brandName}</h1>
      <p className="muted">Nothing has been written yet. Check the pages and categories, then generate the site.</p>
      {gen.error && <div className="err-box" role="alert">{gen.error}</div>}

      <section className="card">
        <h2>Look</h2>
        <p>{gen.brand_note}</p>
        {row && (
          <div className="row swatches" aria-label="Theme colours">
            {(["primary", "accent", "secondary", "surface", "text"] as const).map((k) => (
              <span key={k} className="swatch"><i style={{ background: row.theme.color[k] }} />{k} {row.theme.color[k]}</span>
            ))}
          </div>
        )}
        <p className="hint">You can change colours, fonts and the style pack any time under Theme.</p>
      </section>

      {gen.sheet && (
        <section className="card">
          <h2>Product spreadsheet</h2>
          <p className="muted">{gen.sheet.rows.length} rows. Products are imported exactly as written; nothing is invented. Check what each column means:</p>
          <form action={saveMappingAction.bind(null, siteId)}>
            <div className="grid3">
              {IMPORT_FIELDS.map((f) => (
                <div className="fld" key={f.key}>
                  <label htmlFor={`map_${f.key}`}>{f.label} {!f.required && <span className="opt">optional</span>}</label>
                  <select id={`map_${f.key}`} name={`map_${f.key}`} defaultValue={gen.sheet!.mapping[f.key] ?? ""}>
                    <option value="">— not in the sheet —</option>
                    {gen.sheet!.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button type="submit">Save columns and re-plan</button>
          </form>
          {!cats.length && <p className="err">Map the “Product name” and “Category” columns to create category pages.</p>}
        </section>
      )}

      {plan && (
        <form action={confirmPlanAction.bind(null, siteId)}>
          <section className="card">
            <h2>Pages ({plan.pages.length})</h2>
            <table className="list">
              <thead><tr><th>Keep</th><th>Page</th><th>Address</th><th>Sections</th></tr></thead>
              <tbody>
                {plan.pages.map((p) => (
                  <tr key={p.slug}>
                    <td>
                      <input type="hidden" name="page" value={p.slug} />
                      <input type="checkbox" name="keep" value={p.slug} defaultChecked disabled={REQUIRED.has(p.slug)} aria-label={`Keep ${p.name}`} />
                      {REQUIRED.has(p.slug) && <input type="hidden" name="keep" value={p.slug} />}
                    </td>
                    <td><strong>{p.name}</strong><br /><span className="hint">{p.purpose}</span></td>
                    <td><code>{p.slug}</code></td>
                    <td className="small">{p.blocks.map((b) => BLOCK_LABELS[b].name).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">Home, Contact, Thank You and the legal pages are always included. You can add, remove and rearrange sections later in the page editor.</p>
          </section>

          {plan.collections.length > 0 && (
            <section className="card">
              <h2>Product categories ({plan.collections.length})</h2>
              <p className="muted">Each category gets its own landing page at <code>/products/…</code>, written to rank for that product type.</p>
              <table className="list">
                <thead><tr><th>Category</th><th>Address</th><th>Products</th><th>Service</th></tr></thead>
                <tbody>
                  {plan.collections.map((c) => (
                    <tr key={c.slug}>
                      <td>{c.name}</td>
                      <td><code>/products/{c.slug}</code></td>
                      <td>{cats.find((x) => x.name === c.name)?.products.length ?? 0}</td>
                      <td>
                        <select name={`svc_${c.slug}`} defaultValue={c.service} aria-label={`Service for ${c.name}`}>
                          {qn.services.map((s, i) => <option key={slugs[i]} value={slugs[i]}>{s.name}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <div className="row">
            <button className="primary" type="submit">Generate the site</button>
            <span className="muted">Takes about a minute with an AI model. You can watch the progress.</span>
          </div>
        </form>
      )}
    </main>
  );
}
