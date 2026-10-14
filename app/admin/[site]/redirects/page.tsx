import { requireSite } from "@/lib/auth/session";
import { listRedirects } from "@/lib/repo/editor";
import { list404 } from "@/lib/repo/redirects";
import { editorContext } from "@/lib/admin/context";
import { RedirectForm } from "@/components/admin/RedirectForm";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { deleteRedirectAction, dismiss404Action } from "../actions";

export const metadata = { title: "Redirects & 404s" };

export default async function RedirectsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  await requireSite(siteId);
  const [redirects, missing, ctx] = await Promise.all([listRedirects(siteId), list404(siteId), editorContext(siteId)]);
  return (
    <main className="a-page">
      <h1>Redirects &amp; 404s</h1>
      <p className="sub">Send old or mistyped addresses to the right page, so visitors and search engines don’t hit dead ends. Redirects are permanent (301) and take effect immediately.</p>

      <section className="card">
        <h2>Pages visitors could not find</h2>
        <p className="muted">Collected from the live site. Redirect the ones that matter; dismiss the rest.</p>
        {missing.length === 0 ? <p className="muted">None so far.</p> : (
          <table className="list">
            <thead><tr><th>Address</th><th className="num">Visits</th><th>Last seen</th><th>Redirect to</th><th /></tr></thead>
            <tbody>
              {missing.map((m) => (
                <tr key={m.path}>
                  <td><code>{m.path}</code>{m.referrer && <div className="muted small">from {m.referrer}</div>}</td>
                  <td className="num">{m.hits}</td>
                  <td className="small">{new Date(m.last_seen).toLocaleString("en-US")}</td>
                  <td><RedirectForm siteId={siteId} from={m.path} paths={ctx.sitePaths ?? []} compact /></td>
                  <td><ConfirmButton label="Dismiss" confirmLabel="Confirm" action={dismiss404Action.bind(null, siteId, m.path)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Add a redirect</h2>
        <RedirectForm siteId={siteId} paths={ctx.sitePaths ?? []} />
      </section>

      <section className="card">
        <h2>All redirects ({redirects.length})</h2>
        <p className="muted">Pages, products and categories you rename or delete get a redirect automatically.</p>
        {redirects.length === 0 ? <p className="muted">None yet.</p> : (
          <table className="list">
            <thead><tr><th>From</th><th>To</th><th>Created</th><th /></tr></thead>
            <tbody>
              {redirects.map((r) => (
                <tr key={r.from_path}>
                  <td><code>{r.from_path}</code></td>
                  <td><code>{r.to_path}</code></td>
                  <td className="small">{new Date(r.created_at).toLocaleString("en-US")}</td>
                  <td><ConfirmButton label="Delete" confirmLabel="Confirm delete" action={deleteRedirectAction.bind(null, siteId, r.from_path)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
