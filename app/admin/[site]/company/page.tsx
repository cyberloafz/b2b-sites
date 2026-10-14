import Link from "next/link";
import { requireSite } from "@/lib/auth/session";
import { getSiteRow } from "@/lib/repo/sites";
import { companyJsonSchema, servicesJsonSchema } from "@/lib/admin/schemas";
import { EditForm } from "@/components/admin/EditForm";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { q } from "@/db/client";
import { saveCompanyAction, saveServicesAction } from "../actions";

export const metadata = { title: "Company & settings" };

export default async function CompanyPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  await requireSite(siteId, "owner");
  const row = (await getSiteRow(siteId))!;
  const domains = await q<{ hostname: string; is_primary: boolean; ssl_status: string }>("SELECT hostname, is_primary, ssl_status FROM domains WHERE site_id = $1 ORDER BY is_primary DESC, hostname", [siteId]);
  return (
    <main className="a-page">
      <h1>Company &amp; settings</h1>
      <p className="sub">Company facts feed the footer, contact page, structured data and AI-written copy. Keep them accurate.</p>
      <div className="cards" style={{ gridTemplateColumns: "1.3fr 1fr", alignItems: "start" }}>
        <section className="card">
          <h2>Company</h2>
          <EditForm schema={companyJsonSchema()} value={row.company} action={saveCompanyAction.bind(null, siteId)} />
        </section>
        <div>
          <section className="card">
            <h2>Services</h2>
            <p className="muted">Each category belongs to one service.</p>
            <EditForm schema={servicesJsonSchema()} value={{ services: row.services }} action={saveServicesAction.bind(null, siteId)} />
          </section>
          <section className="card">
            <h2>Integrations &amp; search</h2>
            <SettingsForm siteId={siteId} value={row.settings} />
          </section>
          <section className="card">
            <h2>Domains</h2>
            <table className="list">
              <thead><tr><th>Address</th><th>Status</th></tr></thead>
              <tbody>
                {domains.map((d) => (
                  <tr key={d.hostname}><td>{d.hostname}{d.is_primary && <span className="pill" style={{ marginLeft: 6 }}>primary</span>}</td><td className="muted">{d.ssl_status}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="hint"><Link href={`/admin/${siteId}/domains`}>Connect or manage domains →</Link></p>
          </section>
        </div>
      </div>
    </main>
  );
}
