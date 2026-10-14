import { requireSite } from "@/lib/auth/session";
import { assembleDraft, hasUnpublishedChanges, listVersions } from "@/lib/repo/sites";
import { validateSite } from "@/schema/validate";
import { PublishPanel } from "@/components/admin/PublishPanel";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { restoreAction } from "../actions";
import { latestSeoReport, type Finding } from "@/lib/seo-check";
import { lastSubmission } from "@/lib/search-console";
import { SeoCheckButton } from "@/components/admin/SeoCheckButton";
import Link from "next/link";
import { unreviewedLegalPages, type LegalReview } from "@/lib/legal";
import { getSiteRow } from "@/lib/repo/sites";
import { LegalConfirm } from "@/components/admin/LegalConfirm";

export const metadata = { title: "Publish & history" };
export const maxDuration = 300; // publishing crawls the whole draft for the SEO check first

/** Turns validator paths like "pages[/about].hero" into words an editor understands. */
function where(path: string) {
  return path
    .replace(/^pages\[([^\]]+)\]\.?(.*)$/, (_, s, b) => `Page ${s}${b ? ` › block ${b}` : ""}`)
    .replace(/^globals\.(\w+)/, (_, k) => `Site ${k}`)
    .replace(/^company$/, "Company details")
    .replace(/^collections\.([\w-]+)/, "Category $1")
    .replace(/^products\.([\w-]+)/, "Product $1")
    .replace(/^theme/, "Theme")
    .replace(/^content$/, "Content");
}

export default async function PublishPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const { role } = await requireSite(siteId);
  const [draft, versions, dirty, seo, gsc] = await Promise.all([assembleDraft(siteId), listVersions(siteId), hasUnpublishedChanges(siteId), latestSeoReport(siteId), lastSubmission(siteId)]);
  const byPage = new Map<string, Finding[]>();
  for (const f of seo?.findings ?? []) byPage.set(f.path, [...(byPage.get(f.path) ?? []), f]);
  const { issues } = validateSite(draft!.site);
  const legal = unreviewedLegalPages(draft!.site);
  const review = ((await getSiteRow(siteId))?.settings as { legalReview?: LegalReview } | undefined)?.legalReview;
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  return (
    <main className="a-page">
      <h1>Publish &amp; history</h1>
      <p className="sub">Publishing copies your draft to the live site. Every publish is kept, so you can return to any earlier version.</p>
      <div className="cards" style={{ gridTemplateColumns: "1.2fr 1fr", alignItems: "start" }}>
        <section className="card">
          <h2>Pre-publish check</h2>
          {errors.length === 0 ? (
            <p><span className="pill good">Ready to publish</span> {warnings.length > 0 && <span className="muted">{warnings.length} warning{warnings.length > 1 ? "s" : ""} below won’t block publishing.</span>}</p>
          ) : (
            <p><span className="pill bad">{errors.length} item{errors.length > 1 ? "s" : ""} to fix before publishing</span></p>
          )}
          <ul className="issues">
            {errors.map((e, i) => <li key={`e${i}`}><strong>{where(e.where)}</strong>: {e.message}</li>)}
            {warnings.map((w, i) => <li key={`w${i}`} className="warning"><strong>{where(w.where)}</strong>: {w.message}</li>)}
          </ul>
          <PublishPanel siteId={siteId} canPublish={errors.length === 0} dirty={dirty} />
        </section>
        <section className="card">
          <h2>Legal pages</h2>
          {legal.length > 0 ? (
            <>
              <p>These pages contain sample text written by the platform. US privacy and accessibility rules apply to your website, so have them reviewed (by your counsel where needed) and edit anything that does not match how your company works:</p>
              <ul>{legal.map((p) => <li key={p.slug}><a href={`/preview/${siteId}${p.slug}`} target="_blank" rel="noopener">{p.name}</a></li>)}</ul>
              {role === "owner" ? <LegalConfirm siteId={siteId} /> : <p className="muted">An owner of this site needs to confirm them.</p>}
            </>
          ) : review ? (
            <p className="muted">Confirmed as reviewed by {review.by} on {new Date(review.at).toLocaleDateString("en-US", { dateStyle: "medium" })}.</p>
          ) : (
            <p className="muted">Nothing to confirm.</p>
          )}
        </section>
        <section className="card">
          <h2>Versions</h2>
          <table className="list">
            <thead><tr><th>#</th><th>What</th><th>When</th><th /></tr></thead>
            <tbody>
              {versions.map((v, i) => (
                <tr key={v.id}>
                  <td className="num">{v.number}</td>
                  <td>{v.note || v.kind}<div className="muted small">{v.author}</div></td>
                  <td className="small">{new Date(v.created_at).toLocaleString("en-US")}</td>
                  <td>
                    {i === 0 ? <span className="pill good">Live</span> : role === "owner" && (
                      <ConfirmButton label="Restore" confirmLabel="Restore & publish" action={restoreAction.bind(null, siteId, v.id)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">Restoring replaces the draft with that version and publishes it as a new version.</p>
        </section>
      </div>
      <section className="card">
        <div className="row between">
          <div>
            <h2>SEO &amp; accessibility check</h2>
            <p className="muted">Crawls every page of the draft like a search engine would. Runs automatically when you publish; errors block publishing.</p>
          </div>
          <SeoCheckButton siteId={siteId} />
        </div>
        {!seo ? <p className="muted">Not run yet.</p> : (
          <>
            <p>
              {seo.errors === 0 ? <span className="pill good">No errors</span> : <span className="pill bad">{seo.errors} error{seo.errors > 1 ? "s" : ""}</span>}{" "}
              {seo.warnings > 0 && <span className="pill warn">{seo.warnings} warning{seo.warnings > 1 ? "s" : ""}</span>}{" "}
              <span className="muted small">{seo.pages} pages, {seo.images} images, {seo.links} links · checked {new Date(seo.checkedAt).toLocaleString("en-US")}</span>
              {seo.stale && <span className="pill warn" style={{ marginLeft: 6 }}>Draft changed since — run again</span>}
            </p>
            {[...byPage.entries()].sort((x, y) => y[1].filter((f) => f.level === "error").length - x[1].filter((f) => f.level === "error").length).map(([path, fs]) => (
              <div key={path} style={{ marginBottom: 10 }}>
                <h3><code>{path}</code></h3>
                <ul className="issues">
                  {fs.map((f, i) => (
                    <li key={i} className={f.level === "warning" ? "warning" : ""}>
                      {f.message}
                      {f.edit && <> · <Link href={f.edit}>Fix{f.block ? ` in block ${f.block}` : ""}</Link></>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
        <p className="hint">
          Search Console: {gsc ? `${gsc.status} (${gsc.detail})` : "not submitted yet"}. Redirects and missing pages: <Link href={`/admin/${siteId}/redirects`}>Redirects &amp; 404s</Link>.
        </p>
      </section>
    </main>
  );
}
