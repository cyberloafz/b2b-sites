import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { one, q } from "@/db/client";
import { newToken, sha256, verifyPassword } from "./password";

/**
 * Sessions and access checks. Every admin page and server action calls currentUser() or requireSite().
 * Accounts, invitations, password resets and Google sign-in live in ./accounts.ts and ./google.ts.
 */
const COOKIE = "sid";
const DAYS = 14;
const MAX_FAILURES = 8;        // per email and per IP …
const FAILURE_WINDOW_MIN = 15; // … in this many minutes

export type Role = "owner" | "editor";
export type SessionUser = { id: number; email: string; name: string; hasPassword: boolean; google: boolean; platformAdmin: boolean; sites: { siteId: string; role: Role }[] };

/** Hashed client IP (never stored raw). */
export async function clientIpKey() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
  return sha256(`login:${ip}:${process.env.IP_HASH_SALT ?? "local"}`).slice(0, 32);
}

/** Creates a session cookie for a user who has already proven who they are. */
export async function startSession(userId: number) {
  const token = newToken();
  await q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)", [sha256(token), userId, String(DAYS)]);
  await q("UPDATE users SET last_login_at = now() WHERE id = $1", [userId]);
  await q("DELETE FROM sessions WHERE expires_at < now()");
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1", path: "/", maxAge: DAYS * 86400 });
}

export type LoginResult = { ok: true } | { ok: false; reason: "invalid" | "throttled" | "disabled" };

export async function login(email: string, password: string): Promise<LoginResult> {
  const addr = email.trim().toLowerCase();
  const keys = [`email:${sha256(addr).slice(0, 32)}`, `ip:${await clientIpKey()}`];
  const recent = await one<{ n: number }>(
    `SELECT max(n)::int AS n FROM (SELECT count(*) AS n FROM login_failures WHERE key = ANY($1) AND at > now() - interval '${FAILURE_WINDOW_MIN} minutes' GROUP BY key) x`, [keys]);
  if ((recent?.n ?? 0) >= MAX_FAILURES) return { ok: false, reason: "throttled" };
  const u = await one<{ id: number; password_hash: string | null; disabled: boolean }>("SELECT id, password_hash, disabled_at IS NOT NULL AS disabled FROM users WHERE email = $1", [addr]);
  if (!u || !u.password_hash || !verifyPassword(password, u.password_hash)) {
    for (const k of keys) await q("INSERT INTO login_failures (key) VALUES ($1)", [k]);
    await q("DELETE FROM login_failures WHERE at < now() - interval '1 day'");
    return { ok: false, reason: "invalid" };
  }
  if (u.disabled) return { ok: false, reason: "disabled" };
  await q("DELETE FROM login_failures WHERE key = $1", [keys[0]]);
  await startSession(u.id);
  return { ok: true };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await q("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
  jar.delete(COOKIE);
}

/** Signs a user out everywhere (after a password change or reset), optionally keeping the current session. */
export async function endOtherSessions(userId: number, keepCurrent: boolean) {
  const token = keepCurrent ? (await cookies()).get(COOKIE)?.value : undefined;
  await q("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2", [userId, token ? sha256(token) : ""]);
}

export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const u = await one<{ id: number; email: string; name: string; has_password: boolean; google: boolean; platform_admin: boolean }>(
    `SELECT u.id, u.email, u.name, u.password_hash IS NOT NULL AS has_password, u.google_sub IS NOT NULL AS google, u.platform_admin
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now() AND u.disabled_at IS NULL`, [sha256(token)]);
  if (!u) return null;
  const sites = await q<{ site_id: string; role: Role }>("SELECT site_id, role FROM memberships WHERE user_id = $1", [u.id]);
  return { id: u.id, email: u.email, name: u.name, hasPassword: u.has_password, google: u.google, platformAdmin: u.platform_admin, sites: sites.map((s) => ({ siteId: s.site_id, role: s.role })) };
});

/** Use at the top of every admin page and server action. Owners can do everything; editors edit content. */
export async function requireSite(siteId: string, need: Role = "editor") {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  const m = user.sites.find((s) => s.siteId === siteId);
  if (!m || (need === "owner" && m.role !== "owner")) redirect("/admin?denied=1");
  return { user, role: m.role };
}

/** Platform operators only (users.platform_admin). Customers never see /platform. */
export async function requirePlatformAdmin() {
  const user = await currentUser();
  if (!user) redirect("/admin/login?next=/platform");
  if (!user.platformAdmin) redirect("/admin?denied=1");
  return user;
}
