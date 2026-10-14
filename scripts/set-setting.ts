/**
 * Set a site setting from the command line (useful for local testing, where the admin
 * only accepts https:// webhook URLs).
 *   npx tsx scripts/set-setting.ts demo crmWebhookUrl http://localhost:4555/hook
 */
import { one, q, json } from "../db/client";

async function main() {
  const [siteId, key, value] = process.argv.slice(2);
  if (!siteId || !key) throw new Error("Usage: set-setting.ts <siteId> <key> <value>");
  const row = await one<{ settings: Record<string, unknown> }>("SELECT settings FROM sites WHERE id = $1", [siteId]);
  if (!row) throw new Error(`No site ${siteId}`);
  const parsed = value === "true" ? true : value === "false" ? false : value;
  await q("UPDATE sites SET settings = $1 WHERE id = $2", [json({ ...row.settings, [key]: parsed }), siteId]);
  console.log(`${siteId}.${key} = ${JSON.stringify(parsed)}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
