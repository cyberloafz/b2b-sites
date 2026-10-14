import { NextResponse } from "next/server";
import { adminBase } from "@/lib/auth/accounts";
import { googleAuthUrl, googleEnabled } from "@/lib/auth/google";

/** Starts "Sign in with Google". ?invite=<token> accepts an invitation afterwards; ?link=1 links Google to the signed-in account. */
export async function GET(req: Request) {
  if (!googleEnabled()) return NextResponse.redirect(new URL("/admin/login", req.url));
  const params = new URL(req.url).searchParams;
  const invite = params.get("invite")?.slice(0, 100) || undefined;
  const { url, cookie } = googleAuthUrl(`${await adminBase()}/api/auth/google/callback`, invite);
  const res = NextResponse.redirect(url);
  res.cookies.set("g_oidc", JSON.stringify({ ...cookie, link: params.get("link") === "1" }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1", path: "/api/auth/google", maxAge: 600,
  });
  return res;
}
