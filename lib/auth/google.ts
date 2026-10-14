import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { one, q } from "@/db/client";
import { normalizeEmail, signupAllowed, findInvitation, acceptInvitation } from "./accounts";
import { startSession } from "./session";

/**
 * "Sign in with Google" (OpenID Connect, authorization code flow with PKCE).
 * Enabled when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set. In Google Cloud Console add the
 * redirect URI  <ADMIN_BASE_URL>/api/auth/google/callback .
 * The endpoints can be overridden (GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL, GOOGLE_JWKS_URL, GOOGLE_ISSUER) for tests.
 */
export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const cfg = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  secret: process.env.GOOGLE_CLIENT_SECRET!,
  auth: process.env.GOOGLE_AUTH_URL ?? "https://accounts.google.com/o/oauth2/v2/auth",
  token: process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token",
  jwks: process.env.GOOGLE_JWKS_URL ?? "https://www.googleapis.com/oauth2/v3/certs",
  issuer: (process.env.GOOGLE_ISSUER ?? "https://accounts.google.com,accounts.google.com").split(","),
});
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

const b64url = (b: Buffer) => b.toString("base64url");
export type GoogleState = { state: string; nonce: string; verifier: string; invite?: string };

export function googleAuthUrl(redirectUri: string, invite?: string): { url: string; cookie: GoogleState } {
  const c = cfg();
  const s: GoogleState = { state: b64url(randomBytes(24)), nonce: b64url(randomBytes(24)), verifier: b64url(randomBytes(48)), ...(invite ? { invite } : {}) };
  const challenge = b64url(createHash("sha256").update(s.verifier).digest());
  const u = new URL(c.auth);
  u.search = new URLSearchParams({
    client_id: c.clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile",
    state: s.state, nonce: s.nonce, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  return { url: u.toString(), cookie: s };
}

export type GoogleOutcome = { ok: true; next: string } | { ok: false; error: string };

export async function finishGoogleLogin(params: URLSearchParams, saved: GoogleState | null, redirectUri: string, signedInUserId: number | null): Promise<GoogleOutcome> {
  if (params.get("error")) return { ok: false, error: "Google sign-in was cancelled." };
  if (!saved || params.get("state") !== saved.state) return { ok: false, error: "The sign-in request expired. Please try again." };
  const c = cfg();
  const res = await fetch(c.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: params.get("code") ?? "", client_id: c.clientId, client_secret: c.secret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: saved.verifier }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { ok: false, error: "Google did not accept the sign-in. Please try again." };
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) return { ok: false, error: "Google did not return an identity." };
  jwks ??= createRemoteJWKSet(new URL(c.jwks));
  let claims;
  try {
    ({ payload: claims } = await jwtVerify(id_token, jwks, { issuer: c.issuer, audience: c.clientId }));
  } catch {
    return { ok: false, error: "Google's answer could not be verified." };
  }
  if (claims.nonce !== saved.nonce) return { ok: false, error: "The sign-in request expired. Please try again." };
  const sub = String(claims.sub ?? "");
  const email = normalizeEmail(String(claims.email ?? ""));
  if (!sub || !email || claims.email_verified !== true) return { ok: false, error: "Your Google account has no verified email address." };
  const name = String(claims.name ?? email.split("@")[0]).slice(0, 80);

  // Linking from the account page: attach this Google identity to the signed-in user.
  if (signedInUserId) {
    const other = await one<{ id: number }>("SELECT id FROM users WHERE google_sub = $1 AND id <> $2", [sub, signedInUserId]);
    if (other) return { ok: false, error: "This Google account is already linked to another user." };
    await q("UPDATE users SET google_sub = $1 WHERE id = $2", [sub, signedInUserId]);
    return { ok: true, next: "/admin/account?linked=1" };
  }

  let user = await one<{ id: number }>("SELECT id FROM users WHERE google_sub = $1", [sub]);
  if (!user) {
    // Same verified email as an existing account → link them.
    user = await one<{ id: number }>("UPDATE users SET google_sub = $1 WHERE email = $2 AND google_sub IS NULL RETURNING id", [sub, email]);
  }
  const invite = saved.invite ? await findInvitation(saved.invite) : null;
  if (!user && (signupAllowed() || (invite && invite.email === email))) {
    user = await one<{ id: number }>("INSERT INTO users (email, name, google_sub) VALUES ($1,$2,$3) RETURNING id", [email, name, sub]);
  }
  if (!user) return { ok: false, error: `There is no account for ${email}. Ask a site owner to invite you.` };
  if (await one("SELECT 1 FROM users WHERE id = $1 AND disabled_at IS NOT NULL", [user.id])) return { ok: false, error: "This account is disabled. Contact support." };
  if (invite) {
    const r = await acceptInvitation(saved.invite!, { id: user.id });
    await startSession(user.id);
    return { ok: true, next: r.ok ? `/admin/${r.siteId}` : "/admin" };
  }
  await startSession(user.id);
  return { ok: true, next: "/admin" };
}
