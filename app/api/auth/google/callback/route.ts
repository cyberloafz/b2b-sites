import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminBase } from "@/lib/auth/accounts";
import { finishGoogleLogin, type GoogleState } from "@/lib/auth/google";
import { currentUser } from "@/lib/auth/session";

export async function GET(req: Request) {
  const jar = await cookies();
  let saved: (GoogleState & { link?: boolean }) | null = null;
  try { saved = JSON.parse(jar.get("g_oidc")?.value ?? "null"); } catch { saved = null; }
  jar.delete({ name: "g_oidc", path: "/api/auth/google" });
  const base = await adminBase();
  const me = saved?.link ? await currentUser() : null;
  const r = await finishGoogleLogin(new URL(req.url).searchParams, saved, `${base}/api/auth/google/callback`, me?.id ?? null);
  if (!r.ok) {
    const back = saved?.link ? "/admin/account" : saved?.invite ? `/admin/invite/${encodeURIComponent(saved.invite)}` : "/admin/login";
    return NextResponse.redirect(`${base}${back}?error=${encodeURIComponent(r.error)}`);
  }
  return NextResponse.redirect(`${base}${r.next}`);
}
