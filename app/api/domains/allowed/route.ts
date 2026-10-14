import { certificateAllowed } from "@/lib/domains";

/**
 * For Caddy on-demand TLS (DOMAIN_PROVIDER=caddy): Caddy calls  /api/domains/allowed?domain=<host>
 * before requesting a certificate, and only proceeds on 200. Only verified domains get certificates,
 * so nobody can make the server request certificates for arbitrary names.
 */
export async function GET(req: Request) {
  const domain = new URL(req.url).searchParams.get("domain") ?? "";
  return new Response(null, { status: (await certificateAllowed(domain)) ? 200 : 404 });
}
