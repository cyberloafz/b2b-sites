import { headers } from "next/headers";
import { one, q, tx } from "@/db/client";
import { sendEmail } from "@/lib/repo/inquiries";
import { hashPassword, newToken, sha256, verifyPassword } from "./password";
import { endOtherSessions, startSession, type Role } from "./session";

/**
 * Accounts beyond sign-in: sign-up, invitations, team members, password reset and change.
 * Tokens are random 256-bit values sent by email; only their SHA-256 is stored, and each is single-use.
 */

export type Fail = { ok: false; error: string; field?: string };
const fail = (error: string, field?: string): Fail => ({ ok: false, error, field });
const INVITE_DAYS = 7;
const RESET_MINUTES = 60;

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function checkPassword(pw: string, email = ""): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 200) return "Use at most 200 characters.";
  if (email && pw.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4) return "Do not use your email name in the password.";
  if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|password)/i.test(pw)) return "This password is too easy to guess.";
  return null;
}

export const signupAllowed = () => process.env.ALLOW_SIGNUP === "true";

/** Absolute admin URL for links in emails. */
export async function adminBase() {
  if (process.env.ADMIN_BASE_URL) return process.env.ADMIN_BASE_URL.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const layout = (title: string, body: string, button: { label: string; href: string }, foot: string) => `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>${body}
<p style="margin:24px 0"><a href="${esc(button.href)}" style="background:#1f5f8b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${esc(button.label)}</a></p>
<p style="font-size:13px;color:#6b7280">If the button does not work, copy this address into your browser:<br>${esc(button.href)}</p>
<p style="font-size:13px;color:#6b7280">${foot}</p></body></html>`;

/** Account emails go through the same outbox as inquiry emails (logged, retried by the cron job). */
export async function sendAccountEmail(to: string, subject: string, html: string, siteId: string | null = null) {
  const row = await one<{ id: number }>(
    "INSERT INTO email_outbox (site_id, kind, to_addr, subject, html) VALUES ($1,'account',$2,$3,$4) RETURNING id", [siteId, to, subject, html]);
  await sendEmail(row!.id);
}

// ---------- sign-up

export async function signUp(input: { name: string; email: string; password: string }): Promise<{ ok: true; userId: number } | Fail> {
  if (!signupAllowed()) return fail("Sign-up is closed. Ask for an invitation.");
  const email = normalizeEmail(input.email);
  const name = input.name.trim().slice(0, 80);
  if (!name) return fail("Enter your name.", "name");
  if (!EMAIL.test(email)) return fail("Enter a valid email address.", "email");
  const pwErr = checkPassword(input.password, email);
  if (pwErr) return fail(pwErr, "password");
  if (await one("SELECT 1 FROM users WHERE email = $1", [email])) return fail("An account with this email already exists. Sign in or reset your password.", "email");
  const u = await one<{ id: number }>("INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id", [email, name, hashPassword(input.password)]);
  await startSession(u!.id);
  return { ok: true, userId: u!.id };
}

// ---------- team members and invitations

export async function listMembers(siteId: string) {
  return q<{ user_id: number; email: string; name: string; role: Role; last_login_at: string | null }>(
    "SELECT u.id AS user_id, u.email, u.name, m.role, u.last_login_at FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.site_id = $1 ORDER BY m.role DESC, u.name", [siteId]);
}

export async function listInvitations(siteId: string) {
  return q<{ id: number; email: string; role: Role; expires_at: string; created_at: string }>(
    "SELECT id, email, role, expires_at, created_at FROM invitations WHERE site_id = $1 AND accepted_at IS NULL AND expires_at > now() ORDER BY created_at DESC", [siteId]);
}

export async function inviteMember(siteId: string, by: { id: number; name: string }, emailIn: string, role: Role): Promise<{ ok: true } | Fail> {
  const email = normalizeEmail(emailIn);
  if (!EMAIL.test(email)) return fail("Enter a valid email address.", "email");
  if (!["owner", "editor"].includes(role)) return fail("Choose a role.", "role");
  if (await one("SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.site_id = $1 AND u.email = $2", [siteId, email]))
    return fail("This person is already on the team.", "email");
  const pending = await one<{ n: number }>("SELECT count(*)::int AS n FROM invitations WHERE site_id = $1 AND created_at > now() - interval '1 day'", [siteId]);
  if ((pending?.n ?? 0) >= 20) return fail("Too many invitations today. Try again tomorrow.");
  const token = newToken();
  await q("DELETE FROM invitations WHERE site_id = $1 AND email = $2 AND accepted_at IS NULL", [siteId, email]); // a new invite replaces the old one
  await q("INSERT INTO invitations (site_id, email, role, token_hash, invited_by, expires_at) VALUES ($1,$2,$3,$4,$5, now() + interval '7 days')",
    [siteId, email, role, sha256(token), by.id]);
  const site = await one<{ name: string }>("SELECT name FROM sites WHERE id = $1", [siteId]);
  const link = `${await adminBase()}/admin/invite/${token}`;
  await sendAccountEmail(email, `${by.name} invited you to edit the ${site?.name ?? siteId} website`, layout(
    `Join the ${site?.name ?? siteId} website team`,
    `<p>${esc(by.name)} invited you to work on the website as ${role === "owner" ? "an <b>owner</b> (full access, including publishing settings and team)" : "an <b>editor</b> (pages, products and inquiries)"}.</p>`,
    { label: "Accept the invitation", href: link },
    `This invitation expires in ${INVITE_DAYS} days. If you were not expecting it, you can ignore this email.`), siteId);
  return { ok: true };
}

export async function revokeInvitation(siteId: string, id: number) {
  await q("DELETE FROM invitations WHERE site_id = $1 AND id = $2 AND accepted_at IS NULL", [siteId, id]);
}

export async function findInvitation(token: string) {
  return one<{ id: number; site_id: string; site_name: string; email: string; role: Role; inviter: string | null }>(
    `SELECT i.id, i.site_id, s.name AS site_name, i.email, i.role, u.name AS inviter
       FROM invitations i JOIN sites s ON s.id = i.site_id LEFT JOIN users u ON u.id = i.invited_by
      WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.expires_at > now()`, [sha256(token)]);
}

/**
 * Accept an invitation. A signed-in user joins with their account (whatever its email, since they
 * hold the link sent to the invited address); otherwise a new account is created for the invited email.
 */
export async function acceptInvitation(token: string, signedIn: { id: number } | null, input?: { name: string; password: string }): Promise<{ ok: true; siteId: string } | Fail> {
  const inv = await findInvitation(token);
  if (!inv) return fail("This invitation has expired or was already used. Ask for a new one.");
  let userId = signedIn?.id;
  if (!userId) {
    const existing = await one<{ id: number }>("SELECT id FROM users WHERE email = $1", [inv.email]);
    if (existing) return fail("An account with this email already exists. Sign in first, then open the link again.");
    const name = (input?.name ?? "").trim().slice(0, 80);
    if (!name) return fail("Enter your name.", "name");
    const pwErr = checkPassword(input?.password ?? "", inv.email);
    if (pwErr) return fail(pwErr, "password");
    const u = await one<{ id: number }>("INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id", [inv.email, name, hashPassword(input!.password)]);
    userId = u!.id;
  }
  await tx(async (t) => {
    await t.query("INSERT INTO memberships (user_id, site_id, role) VALUES ($1,$2,$3) ON CONFLICT (user_id, site_id) DO UPDATE SET role = CASE WHEN memberships.role = 'owner' THEN 'owner' ELSE EXCLUDED.role END",
      [userId, inv.site_id, inv.role]);
    await t.query("UPDATE invitations SET accepted_at = now() WHERE id = $1", [inv.id]);
  });
  if (!signedIn) await startSession(userId!);
  return { ok: true, siteId: inv.site_id };
}

async function ownerCount(siteId: string) {
  return (await one<{ n: number }>("SELECT count(*)::int AS n FROM memberships WHERE site_id = $1 AND role = 'owner'", [siteId]))?.n ?? 0;
}

export async function changeRole(siteId: string, userId: number, role: Role): Promise<{ ok: true } | Fail> {
  if (!["owner", "editor"].includes(role)) return fail("Choose a role.");
  const m = await one<{ role: Role }>("SELECT role FROM memberships WHERE site_id = $1 AND user_id = $2", [siteId, userId]);
  if (!m) return fail("Not a member of this site.");
  if (m.role === "owner" && role !== "owner" && (await ownerCount(siteId)) <= 1) return fail("A site needs at least one owner. Make someone else an owner first.");
  await q("UPDATE memberships SET role = $1 WHERE site_id = $2 AND user_id = $3", [role, siteId, userId]);
  return { ok: true };
}

export async function removeMember(siteId: string, userId: number): Promise<{ ok: true } | Fail> {
  const m = await one<{ role: Role }>("SELECT role FROM memberships WHERE site_id = $1 AND user_id = $2", [siteId, userId]);
  if (!m) return fail("Not a member of this site.");
  if (m.role === "owner" && (await ownerCount(siteId)) <= 1) return fail("A site needs at least one owner.");
  await q("DELETE FROM memberships WHERE site_id = $1 AND user_id = $2", [siteId, userId]);
  return { ok: true };
}

// ---------- password reset and change

/** Always answers the same way, so the form cannot be used to find out who has an account. */
export async function requestPasswordReset(emailIn: string): Promise<void> {
  const email = normalizeEmail(emailIn);
  const u = await one<{ id: number; name: string }>("SELECT id, name FROM users WHERE email = $1", [email]);
  if (!u) return;
  const recent = await one<{ n: number }>("SELECT count(*)::int AS n FROM password_resets WHERE user_id = $1 AND created_at > now() - interval '1 hour'", [u.id]);
  if ((recent?.n ?? 0) >= 3) return;
  const token = newToken();
  await q(`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1,$2, now() + interval '${RESET_MINUTES} minutes')`, [sha256(token), u.id]);
  const link = `${await adminBase()}/admin/reset/${token}`;
  await sendAccountEmail(email, "Reset your password", layout(
    "Reset your password",
    `<p>Hi ${esc(u.name)}, someone (hopefully you) asked to reset the password for this account.</p>`,
    { label: "Choose a new password", href: link },
    `The link works once and expires in ${RESET_MINUTES} minutes. If you did not ask for this, ignore this email; your password stays the same.`));
}

export async function findReset(token: string) {
  return one<{ user_id: number; email: string }>(
    "SELECT r.user_id, u.email FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()", [sha256(token)]);
}

export async function resetPassword(token: string, password: string): Promise<{ ok: true } | Fail> {
  const r = await findReset(token);
  if (!r) return fail("This link has expired or was already used. Ask for a new one.");
  const pwErr = checkPassword(password, r.email);
  if (pwErr) return fail(pwErr, "password");
  await q("UPDATE users SET password_hash = $1 WHERE id = $2", [hashPassword(password), r.user_id]);
  await q("UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [r.user_id]);
  await endOtherSessions(r.user_id, false);
  await q("DELETE FROM login_failures WHERE key = $1", [`email:${sha256(r.email).slice(0, 32)}`]);
  await startSession(r.user_id);
  return { ok: true };
}

export async function changePassword(userId: number, current: string, next: string): Promise<{ ok: true } | Fail> {
  const u = await one<{ email: string; password_hash: string | null }>("SELECT email, password_hash FROM users WHERE id = $1", [userId]);
  if (!u) return fail("Account not found.");
  if (u.password_hash && !verifyPassword(current, u.password_hash)) return fail("Your current password is not correct.", "current");
  const pwErr = checkPassword(next, u.email);
  if (pwErr) return fail(pwErr, "password");
  await q("UPDATE users SET password_hash = $1 WHERE id = $2", [hashPassword(next), userId]);
  await endOtherSessions(userId, true);
  return { ok: true };
}

export async function renameUser(userId: number, name: string): Promise<{ ok: true } | Fail> {
  const n = name.trim().slice(0, 80);
  if (!n) return fail("Enter your name.", "name");
  await q("UPDATE users SET name = $1 WHERE id = $2", [n, userId]);
  return { ok: true };
}

// ---------- first run

/**
 * Creates the first account (a platform admin) on an empty database. If SETUP_CODE is set, it must be given,
 * so nobody else can claim a freshly deployed platform before its owner does.
 */
export async function createFirstAdmin(input: { name: string; email: string; password: string; code: string }): Promise<{ ok: true } | Fail> {
  if (process.env.SETUP_CODE && input.code.trim() !== process.env.SETUP_CODE) return fail("The setup code is not correct.", "code");
  const email = normalizeEmail(input.email);
  const name = input.name.trim().slice(0, 80);
  if (!name) return fail("Enter your name.", "name");
  if (!EMAIL.test(email)) return fail("Enter a valid email address.", "email");
  const pwErr = checkPassword(input.password, email);
  if (pwErr) return fail(pwErr, "password");
  const id = await tx(async (t) => {
    await t.query("SELECT pg_advisory_xact_lock(424242)");
    const any = await t.query("SELECT 1 FROM users LIMIT 1");
    if (any.rows.length) return null;
    const r = await t.query<{ id: number }>("INSERT INTO users (email, name, password_hash, platform_admin) VALUES ($1,$2,$3,true) RETURNING id", [email, name, hashPassword(input.password)]);
    return r.rows[0].id;
  });
  if (!id) return fail("Setup is already done. Sign in instead.");
  await startSession(id);
  return { ok: true };
}
