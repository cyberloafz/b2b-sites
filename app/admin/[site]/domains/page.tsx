import { requireSite } from "@/lib/auth/session";
import { VERIFY_PREFIX, apexIps, cnameTarget, isApex, listDomains, provider, type DomainRow } from "@/lib/domains";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { AddDomainForm, DomainButton } from "@/components/admin/DomainControls";
import { removeDomainAction } from "../domain-actions";

export const metadata = { title: "Domains" };

function status(d: DomainRow): { label: string; tone: "good" | "warn" | "bad" | "" } {
  if (d.kind === "staging") return { label: "Platform address", tone: "" };
  if (!d.verified_at) return { label: "Waiting for DNS (ownership)", tone: "warn" };
  if (!d.dns_ok) return { label: "Waiting for DNS (pointing)", tone: "warn" };
  if (d.ssl_status === "failed") return { label: "Certificate failed", tone: "bad" };
  if (d.ssl_status !== "active") return { label: "Issuing certificate", tone: "warn" };
  return { label: "Ready", tone: "good" };
}

export default async function DomainsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  await requireSite(siteId, "owner");
  const domains = await listDomains(siteId);
  const custom = domains.filter((d) => d.kind === "custom");
  const ips = apexIps();
  const target = cnameTarget();
  const primary = domains.find((d) => d.is_primary && d.kind === "custom" && d.ssl_status === "active");
  const hosts = new Set(domains.map((d) => d.hostname));
  // Suggest the twin: example.com ↔ www.example.com.
  const twins = custom.map((d) => (d.hostname.startsWith("www.") ? d.hostname.slice(4) : `www.${d.hostname}`)).filter((h) => !hosts.has(h));

  return (
    <main className="a-page">
      <h1>Domains</h1>
      <p className="muted">
        Connect your company’s own domain. You add two DNS records at your domain registrar (GoDaddy, Namecheap, Squarespace, Cloudflare…);
        we check them, set up HTTPS automatically, and then you can make the domain your site’s main address.
      </p>
      <p className={`pill ${primary ? "good" : "warn"}`}>Main address: {primary ? `https://${primary.hostname}` : "not set yet (the site uses its platform address)"}</p>

      <section className="card">
        <h2>Add a domain</h2>
        <AddDomainForm siteId={siteId} />
        <p className="hint">Tip: add both <code>yourcompany.com</code> and <code>www.yourcompany.com</code>, make <code>www</code> the main address, and the other one will redirect to it.</p>
        {twins.length > 0 && <p className="hint">Not added yet: {twins.map((t) => <code key={t} style={{ marginRight: 6 }}>{t}</code>)}</p>}
      </section>

      <section className="card">
        <h2>Your addresses</h2>
        <table className="list">
          <thead><tr><th>Domain</th><th>Status</th><th>Last check</th><th /></tr></thead>
          <tbody>
            {domains.map((d) => {
              const st = status(d);
              const ready = st.label === "Ready";
              return (
                <tr key={d.hostname}>
                  <td><strong>{d.hostname}</strong>{d.is_primary && d.kind === "custom" && <span className="pill good" style={{ marginLeft: 6 }}>main address</span>}</td>
                  <td><span className={`pill ${st.tone}`}>{st.label}</span>{d.last_error && d.kind === "custom" && !ready && <p className="hint">{d.last_error}</p>}</td>
                  <td className="small">{d.last_check_at ? new Date(d.last_check_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—"}</td>
                  <td>
                    {d.kind === "custom" && (
                      <span className="row">
                        {!ready && <DomainButton siteId={siteId} hostname={d.hostname} kind="check" label="Check now" />}
                        {ready && !d.is_primary && <DomainButton siteId={siteId} hostname={d.hostname} kind="primary" label="Make main address" />}
                        {!d.is_primary && <ConfirmButton label="Remove" confirmLabel={`Remove ${d.hostname}`} action={removeDomainAction.bind(null, siteId, d.hostname)} />}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="hint">DNS changes can take from a few minutes to a few hours. Unfinished domains are re-checked automatically every few minutes.</p>
      </section>

      {custom.filter((d) => status(d).label !== "Ready").map((d) => (
        <section className="card" key={d.hostname}>
          <h2>DNS records for {d.hostname}</h2>
          <p className="muted">Create these records at the company that manages your domain’s DNS, then press “Check now”.</p>
          <table className="list dns">
            <thead><tr><th>Type</th><th>Name / Host</th><th>Value / Points to</th><th>Purpose</th></tr></thead>
            <tbody>
              <tr><td>TXT</td><td><code>{VERIFY_PREFIX}{isApex(d.hostname) ? "" : `.${d.hostname.split(".").slice(0, -2).join(".")}`}</code></td><td><code>{d.verify_token}</code></td><td>Proves you own the domain</td></tr>
              {isApex(d.hostname) ? (
                ips.length ? ips.map((ip) => <tr key={ip}><td>A</td><td><code>@</code></td><td><code>{ip}</code></td><td>Sends visitors to your site</td></tr>)
                  : <tr><td>ALIAS / ANAME</td><td><code>@</code></td><td><code>{target}</code></td><td>Sends visitors to your site (use “CNAME flattening” at Cloudflare)</td></tr>
              ) : (
                <tr><td>CNAME</td><td><code>{d.hostname.split(".").slice(0, -2).join(".")}</code></td><td><code>{target}</code></td><td>Sends visitors to your site</td></tr>
              )}
            </tbody>
          </table>
          <p className="hint">Full names: <code>{VERIFY_PREFIX}.{d.hostname}</code> and <code>{d.hostname}</code>. Some registrars want only the part before your domain, as shown in the table. Remove any old A/AAAA/CNAME records for {d.hostname} that point elsewhere.</p>
        </section>
      ))}

      <p className="hint">HTTPS certificates: {({ vercel: "issued by Vercel", cloudflare: "issued by Cloudflare", caddy: "issued automatically by the platform server", manual: "managed by the platform operator" } as const)[provider()]}.</p>
    </main>
  );
}
