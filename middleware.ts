import { NextResponse, type NextRequest } from "next/server";

/**
 * Multi-tenant entry point. Every public request is rewritten to /s/<hostname>/<path>;
 * the page then looks the hostname up in the `domains` table to find the site.
 * Platform routes (admin, preview, api, media, framework assets) pass through untouched.
 */
// Platform files in /public (shared images such as placeholders) are served as-is too.
// Whole path segments only, so a customer page like /administration or /platform-solutions still reaches the site.
const PASS = /^\/(admin|platform|preview|api|media|images|_next)(\/|$)|^\/s\/|^\/favicon\.ico$/;

// In production the admin lives on one host (ADMIN_HOST, e.g. app.yourplatform.com), never on customer domains.
const ADMIN_ONLY = /^\/(admin|platform|preview|api\/auth)(\/|$)/;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  // On Vercel without a custom admin domain, the project's production address (…vercel.app) is the admin host.
  const adminHost = (process.env.ADMIN_HOST ?? process.env.VERCEL_PROJECT_PRODUCTION_URL)?.toLowerCase();
  if (adminHost) {
    if (host === adminHost && pathname === "/") return NextResponse.redirect(new URL("/admin", req.url));
    if (host !== adminHost && ADMIN_ONLY.test(pathname)) return NextResponse.redirect(`https://${adminHost}${pathname}${req.nextUrl.search}`);
  }
  if (PASS.test(pathname)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/s/${encodeURIComponent(host)}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
