/**
 * Webhook retry schedule against the mock services (no web server needed; uses its own database).
 *   PGLITE_DIR=/tmp/pg-webhook-test npx tsx tests/check-webhook-retry.mts
 */
import { rmSync } from "node:fs";
import { loadRawSite } from "../lib/site-data";
import { validateSite } from "../schema/validate";
import { writeDraft } from "../lib/repo/sites";
import { receiveInquiry, processDue } from "../lib/repo/inquiries";
import { q, one, json } from "../db/client";

const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${!cond && detail ? `  (${detail})` : ""}`);
  if (!cond) process.exitCode = 1;
};

if (!process.env.PGLITE_DIR) throw new Error("Set PGLITE_DIR to a throwaway folder");
rmSync(process.env.PGLITE_DIR, { recursive: true, force: true });

const { site } = validateSite(loadRawSite());
await writeDraft("t", { site: site!, hidden: [] });
await q("UPDATE sites SET settings = $1 WHERE id = 't'", [json({ crmWebhookUrl: "http://localhost:4555/fail" })]);

const env = { inquiry: { form: "contact" as const, name: "Retry Test", email: "retry@test.com", message: "Testing webhook retries" }, source: {}, marketingConsent: false, elapsedMs: 9000 };
const r = await receiveInquiry("t", env, "10.9.9.9");
if (!r.ok) throw new Error("not accepted");
for (const j of r.jobs) await j();

const state = () => one<{ status: string; attempts: number; mins: number }>(
  "SELECT status, attempts, round(extract(epoch FROM next_attempt_at - now()) / 60)::int AS mins FROM webhook_deliveries ORDER BY id DESC LIMIT 1");

let s = await state();
ok("failed delivery is scheduled for retry in 1 minute", s?.status === "pending" && s.attempts === 1 && s.mins === 1, JSON.stringify(s));

const expectMins = [5, 30];
for (const m of expectMins) {
  await q("UPDATE webhook_deliveries SET next_attempt_at = now() - interval '1 second'");
  await processDue();
  s = await state();
  ok(`retry ${s?.attempts} fails and waits ${m} minutes`, s?.status === "pending" && s.mins === m, JSON.stringify(s));
}
await q("UPDATE webhook_deliveries SET next_attempt_at = now() - interval '1 second'");
await processDue();
s = await state();
ok("after 4 attempts the delivery is marked failed", s?.status === "failed" && s.attempts === 4, JSON.stringify(s));

// A healthy endpoint delivers on the first try.
await q("UPDATE sites SET settings = $1 WHERE id = 't'", [json({ crmWebhookUrl: "http://localhost:4555/hook" })]);
const r2 = await receiveInquiry("t", { ...env, inquiry: { ...env.inquiry, email: "ok@test.com" } }, "10.9.9.8");
if (r2.ok) for (const j of r2.jobs) await j();
s = await state();
ok("healthy endpoint is delivered first time", s?.status === "delivered" && s.attempts === 1, JSON.stringify(s));
process.exit(process.exitCode ?? 0);
