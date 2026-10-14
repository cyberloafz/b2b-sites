/**
 * Imports a site from JSON files into the database, publishes it, and wires up domains and an owner.
 *   npx tsx scripts/db-import.ts [siteId=demo] [dataDir=data]
 * Owner login comes from ADMIN_EMAIL / ADMIN_PASSWORD (defaults are for local use only).
 */
import { loadRawSite } from "../lib/site-data";
import { validateSite } from "../schema/validate";
import { writeDraft, publish } from "../lib/repo/sites";
import { q, one } from "../db/client";
import { hashPassword } from "../lib/auth/password";

async function main() {
  const siteId = process.argv[2] ?? "demo";
  const dir = process.argv[3];

  const { site, issues } = validateSite(loadRawSite(dir));
  const errors = issues.filter((i) => i.level === "error");
  if (!site || errors.length) {
    console.error("Site data is invalid:\n" + errors.map((e) => ` - ${e.where}: ${e.message}`).join("\n"));
    process.exit(1);
  }

  await writeDraft(siteId, { site, hidden: [] });
  const res = await publish(siteId, "import", "Initial import from data/*.json", "import");
  if (!res.ok) throw new Error(JSON.stringify(res.issues));

  for (const host of ["localhost", "127.0.0.1", new URL(site.company.siteUrl).hostname]) {
    // Imported by the operator: trusted without a DNS ownership check.
    await q("INSERT INTO domains (hostname, site_id, is_primary, kind, verified_at, dns_ok) VALUES ($1,$2,$3,'staging',now(),true) ON CONFLICT (hostname) DO UPDATE SET site_id = EXCLUDED.site_id",
      [host, siteId, host === new URL(site.company.siteUrl).hostname]);
  }

  const email = (process.env.ADMIN_EMAIL ?? "owner@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "change-me-now";
  let user = await one<{ id: number }>("SELECT id FROM users WHERE email = $1", [email]);
  if (!user) user = await one<{ id: number }>("INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id", [email, "Site Owner", hashPassword(password)]);
  await q("INSERT INTO memberships (user_id, site_id, role) VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING", [user!.id, siteId]);
  // Local demo: the owner also runs the platform — unless the platform already has an admin.
  await q("UPDATE users SET platform_admin = true WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM users WHERE platform_admin)", [user!.id]);

  console.log(`Imported "${siteId}": ${site.pages.length} pages, ${site.collections.length} categories, ${site.products.length} products. Published version ${res.versionNumber}.`);
  console.log(`Owner login: ${email}${process.env.ADMIN_PASSWORD ? "" : " / change-me-now (local default — set ADMIN_PASSWORD)"}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
