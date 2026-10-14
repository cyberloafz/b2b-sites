/**
 * Creates (or resets) a platform admin account from the command line — an alternative to the
 * first-run page /admin/setup. Does not import the demo site.
 *   ADMIN_PASSWORD='…' npx tsx scripts/create-admin.ts you@yourplatform.com "Your Name"
 * The account can then create sites at /admin/new and invite others.
 */
import { one } from "../db/client";
import { hashPassword } from "../lib/auth/password";
import { checkPassword } from "../lib/auth/accounts";

async function main() {
  const [email, name = "Platform Admin"] = process.argv.slice(2);
  const pw = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !/@/.test(email)) throw new Error("Usage: ADMIN_PASSWORD=… npx tsx scripts/create-admin.ts email \"Name\"");
  const bad = checkPassword(pw, email);
  if (bad) throw new Error(`ADMIN_PASSWORD: ${bad}`);
  const u = await one<{ id: number }>(
    "INSERT INTO users (email, name, password_hash, platform_admin) VALUES ($1,$2,$3,true) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, platform_admin = true RETURNING id",
    [email.trim().toLowerCase(), name, hashPassword(pw)]);
  console.log(`Account ready: ${email} (id ${u!.id}). Platform admin. Sign in at /admin/login.`);
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
