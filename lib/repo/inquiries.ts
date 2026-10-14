import { createHmac } from "node:crypto";
import { json, one, q } from "@/db/client";
import { sha256 } from "@/lib/auth/password";
import { getSiteRow } from "./sites";
import type { z } from "zod";
import type { InquiryEnvelope } from "@/schema/inquiry";

/**
 * Inquiry pipeline: store → (if not spam) queue notification + auto-reply emails and the CRM webhook
 * → deliver. Delivery failures never lose the inquiry: it is already in the database, and the
 * cron route retries emails and webhooks.
 */

type Envelope = z.infer<typeof InquiryEnvelope>;
export type InquiryRow = {
  id: number; site_id: string; form: string; fields: Record<string, unknown>; source: Record<string, string>;
  marketing_consent: boolean; status: string; spam: boolean; received_at: string; updated_at: string;
};
export const STATUSES = ["new", "following_up", "quoted", "won", "invalid"] as const;
export const STATUS_LABEL: Record<string, string> = { new: "New", following_up: "Following up", quoted: "Quoted", won: "Won", invalid: "Invalid" };
export const FORM_LABEL: Record<string, string> = { contact: "Contact", quote: "Quote request", sample: "Sample request", project: "Custom project", spec_sheet: "Spec sheet" };

const WINDOW_MIN = 10;
const MAX_PER_WINDOW = 5;
const DISPOSABLE = ["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "yopmail.com", "trashmail.com", "sharklasers.com"];
const BACKOFF_MIN = [1, 5, 30];

export async function receiveInquiry(siteId: string, env: Envelope, ip: string) {
  const ipHash = sha256(`${siteId}:${ip}:${process.env.IP_HASH_SALT ?? "local"}`).slice(0, 32);
  const recent = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM inquiries WHERE site_id = $1 AND ip_hash = $2 AND received_at > now() - interval '${WINDOW_MIN} minutes'`, [siteId, ipHash]);
  if ((recent?.n ?? 0) >= MAX_PER_WINDOW) return { ok: false as const, status: 429, error: "Too many requests. Please try again in a few minutes." };

  const fields = env.inquiry as Record<string, unknown>;
  const email = String(fields.email ?? "").toLowerCase();
  const text = Object.values(fields).filter((v) => typeof v === "string").join(" ");
  const spam =
    !!env.website ||                                              // honeypot filled
    (env.elapsedMs !== undefined && env.elapsedMs < 3000) ||     // submitted faster than a person can type
    DISPOSABLE.some((d) => email.endsWith("@" + d)) ||
    (text.match(/https?:\/\//g)?.length ?? 0) > 3;

  const row = await one<{ id: number }>(
    `INSERT INTO inquiries (site_id, form, fields, source, marketing_consent, status, spam, ip_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [siteId, env.inquiry.form, json(fields), json(env.source ?? {}), env.marketingConsent, spam ? "invalid" : "new", spam, ipHash]
  );
  const id = row!.id;
  if (spam) return { ok: true as const, id, spam, jobs: [] as (() => Promise<void>)[] };

  const site = await getSiteRow(siteId);
  const jobs: (() => Promise<void>)[] = [];
  if (site) {
    const co = site.company;
    const adminUrl = `${process.env.ADMIN_BASE_URL ?? ""}/admin/${siteId}/inquiries/${id}`;
    const title = `${FORM_LABEL[env.inquiry.form] ?? "Inquiry"} from ${fields.company || fields.name || email}`;
    for (const to of co.inquiryRecipients) {
      const e = await one<{ id: number }>(
        "INSERT INTO email_outbox (site_id, inquiry_id, kind, to_addr, reply_to, subject, html) VALUES ($1,$2,'notify',$3,$4,$5,$6) RETURNING id",
        [siteId, id, to, email || null, `[${co.brandName}] ${title}`, notifyHtml(title, fields, env.source ?? {}, adminUrl)]);
      jobs.push(() => sendEmail(e!.id));
    }
    if (email) {
      const e = await one<{ id: number }>(
        "INSERT INTO email_outbox (site_id, inquiry_id, kind, to_addr, reply_to, subject, html) VALUES ($1,$2,'autoreply',$3,$4,$5,$6) RETURNING id",
        [siteId, id, email, co.email, `We received your request — ${co.brandName}`, autoReplyHtml(co.brandName, co.phoneDisplay, co.email, String(fields.name ?? ""))]);
      jobs.push(() => sendEmail(e!.id));
    }
    if (site.settings.crmWebhookUrl) {
      const w = await one<{ id: number }>("INSERT INTO webhook_deliveries (site_id, inquiry_id, url) VALUES ($1,$2,$3) RETURNING id", [siteId, id, site.settings.crmWebhookUrl]);
      jobs.push(() => deliverWebhook(w!.id));
    }
  }
  return { ok: true as const, id, spam, jobs };
}

// ---------- email ----------

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const label = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

function notifyHtml(title: string, fields: Record<string, unknown>, source: Record<string, string>, adminUrl: string) {
  const rows = Object.entries(fields).filter(([k]) => k !== "form")
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top">${esc(label(k))}</td><td style="padding:4px 0">${esc(Array.isArray(v) ? v.join(", ") : v)}</td></tr>`).join("");
  const channel = sourceSummary(source);
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1f26">
<h2 style="font-size:18px">${esc(title)}</h2>
<table style="border-collapse:collapse">${rows}</table>
<p style="color:#555">Came from: <strong>${esc(channel)}</strong>${source.landingPage ? ` · first page ${esc(source.landingPage)}` : ""}${source.submittedFrom ? ` · sent from ${esc(source.submittedFrom)}` : ""}</p>
<p><a href="${esc(adminUrl)}">Open in the inquiry inbox</a> · Reply to this email to answer the customer directly.</p></div>`;
}

function autoReplyHtml(brand: string, phone: string, email: string, name: string) {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1f26">
<p>${name ? `Hi ${esc(name.split(" ")[0])},` : "Hello,"}</p>
<p>Thank you for contacting ${esc(brand)}. We received your request and a specialist will reply within one business day.</p>
<p>If it is urgent, call us at ${esc(phone)} or reply to this email (${esc(email)}).</p>
<p>${esc(brand)}</p></div>`;
}

export function sourceSummary(s: Record<string, string>) {
  if (s.gclid || s.gbraid) return `Google Ads${s.utm_campaign ? ` (${s.utm_campaign})` : ""}`;
  if (s.fbclid) return "Facebook / Instagram";
  if (s.msclkid) return "Microsoft Ads";
  if (s.utm_source) return [s.utm_source, s.utm_medium, s.utm_campaign].filter(Boolean).join(" / ");
  if (s.referrer) {
    try {
      const h = new URL(s.referrer).hostname.replace(/^www\./, "");
      return /google\.|bing\.|duckduckgo\.|yahoo\./.test(h) ? `Search (${h})` : `Referral (${h})`;
    } catch { /* fall through */ }
  }
  return "Direct";
}

export async function sendEmail(id: number) {
  const m = await one<{ to_addr: string; reply_to: string | null; subject: string; html: string; attempts: number }>(
    "SELECT to_addr, reply_to, subject, html, attempts FROM email_outbox WHERE id = $1 AND status IN ('queued','failed')", [id]);
  if (!m) return;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    await q("UPDATE email_outbox SET status = 'skipped', last_error = 'RESEND_API_KEY is not set: email recorded but not sent' WHERE id = $1", [id]);
    return;
  }
  try {
    const res = await fetch(process.env.RESEND_API_URL ?? "https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Website <onboarding@resend.dev>", to: [m.to_addr], reply_to: m.reply_to ?? undefined, subject: m.subject, html: m.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await q("UPDATE email_outbox SET status = 'sent', attempts = attempts + 1, sent_at = now(), last_error = NULL WHERE id = $1", [id]);
  } catch (e) {
    await q("UPDATE email_outbox SET status = 'failed', attempts = attempts + 1, last_error = $2 WHERE id = $1", [id, String(e).slice(0, 300)]);
  }
}

// ---------- CRM webhook ----------

export async function deliverWebhook(id: number) {
  const d = await one<{ url: string; attempts: number; inquiry_id: number; site_id: string }>(
    "SELECT url, attempts, inquiry_id, site_id FROM webhook_deliveries WHERE id = $1 AND status = 'pending'", [id]);
  if (!d) return;
  const inq = await one<InquiryRow>("SELECT * FROM inquiries WHERE id = $1", [d.inquiry_id]);
  if (!inq) return;
  const body = JSON.stringify({
    event: "inquiry.created",
    site: inq.site_id,
    inquiry: { id: inq.id, form: inq.form, fields: inq.fields, source: inq.source, channel: sourceSummary(inq.source), marketingConsent: inq.marketing_consent, receivedAt: inq.received_at },
  });
  // Receivers can verify the payload with the shared secret.
  const signature = createHmac("sha256", process.env.WEBHOOK_SECRET ?? "local-dev-secret").update(body).digest("hex");
  try {
    const res = await fetch(d.url, { method: "POST", headers: { "content-type": "application/json", "x-signature-sha256": signature }, body, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await q("UPDATE webhook_deliveries SET status = 'delivered', attempts = attempts + 1, last_error = NULL WHERE id = $1", [id]);
  } catch (e) {
    const attempts = d.attempts + 1;
    const done = attempts > BACKOFF_MIN.length;
    await q(
      `UPDATE webhook_deliveries SET attempts = $2, last_error = $3, status = $4,
         next_attempt_at = now() + ($5 || ' minutes')::interval WHERE id = $1`,
      [id, attempts, String(e).slice(0, 300), done ? "failed" : "pending", String(BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)])]
    );
  }
}

/** Called by the cron route: retry due webhooks and failed emails. */
export async function processDue() {
  const hooks = await q<{ id: number }>("SELECT id FROM webhook_deliveries WHERE status = 'pending' AND next_attempt_at <= now() ORDER BY id LIMIT 50");
  for (const h of hooks) await deliverWebhook(h.id);
  const mails = await q<{ id: number }>("SELECT id FROM email_outbox WHERE status IN ('queued','failed') AND attempts < 3 ORDER BY id LIMIT 50");
  for (const m of mails) await sendEmail(m.id);
  return { webhooks: hooks.length, emails: mails.length };
}

// ---------- admin inbox ----------

export type InquiryFilter = { status?: string; form?: string; channel?: string; q?: string; spam?: boolean; from?: string; to?: string };

export async function listInquiries(siteId: string, f: InquiryFilter, limit = 200) {
  const where = ["site_id = $1", f.spam ? "spam" : "NOT spam"];
  const params: unknown[] = [siteId];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
  if (f.status) add("status = ?", f.status);
  if (f.form) add("form = ?", f.form);
  if (f.from) add("received_at >= ?::date", f.from);
  if (f.to) add("received_at < (?::date + 1)", f.to);
  if (f.q) add("fields::text ILIKE ?", `%${f.q}%`);
  if (f.channel === "ads") where.push("(source ? 'gclid' OR source ? 'gbraid' OR source ? 'fbclid' OR source ? 'msclkid')");
  if (f.channel === "utm") where.push("source ? 'utm_source'");
  if (f.channel === "organic") where.push("NOT (source ? 'gclid' OR source ? 'gbraid' OR source ? 'fbclid' OR source ? 'msclkid' OR source ? 'utm_source')");
  return q<InquiryRow>(`SELECT * FROM inquiries WHERE ${where.join(" AND ")} ORDER BY received_at DESC LIMIT ${limit}`, params);
}

export async function getInquiry(siteId: string, id: number) {
  const inq = await one<InquiryRow>("SELECT * FROM inquiries WHERE site_id = $1 AND id = $2", [siteId, id]);
  if (!inq) return null;
  const emails = await q<{ kind: string; to_addr: string; status: string; last_error: string | null; created_at: string }>(
    "SELECT kind, to_addr, status, last_error, created_at FROM email_outbox WHERE inquiry_id = $1 ORDER BY id", [id]);
  const hooks = await q<{ url: string; status: string; attempts: number; last_error: string | null }>(
    "SELECT url, status, attempts, last_error FROM webhook_deliveries WHERE inquiry_id = $1 ORDER BY id", [id]);
  return { inq, emails, hooks };
}

export async function setInquiryStatus(siteId: string, id: number, status: string) {
  if (!(STATUSES as readonly string[]).includes(status)) return;
  await q("UPDATE inquiries SET status = $1, spam = CASE WHEN $1 = 'invalid' THEN spam ELSE false END, updated_at = now() WHERE site_id = $2 AND id = $3", [status, siteId, id]);
}

export function toCsv(rows: InquiryRow[]) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.fields)).filter((k) => k !== "form"))];
  const head = ["id", "received_at", "form", "status", "channel", ...keys, "marketing_consent", "utm_source", "utm_medium", "utm_campaign", "gclid", "landing_page", "submitted_from"];
  const cell = (v: unknown) => {
    const s = Array.isArray(v) ? v.join("; ") : v == null ? "" : String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // stop spreadsheet formula injection
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = rows.map((r) =>
    [r.id, new Date(r.received_at).toISOString(), r.form, r.status, sourceSummary(r.source), ...keys.map((k) => r.fields[k]), r.marketing_consent ? "yes" : "no",
      r.source.utm_source, r.source.utm_medium, r.source.utm_campaign, r.source.gclid, r.source.landingPage, r.source.submittedFrom].map(cell).join(","));
  return "﻿" + [head.join(","), ...lines].join("\r\n") + "\r\n";
}
