/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" }, // the admin preview frames the site from the same origin
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // HSTS per host only (no includeSubDomains: customer domains may have other subdomains on plain HTTP).
  ...(process.env.NODE_ENV === "production" && process.env.DISABLE_HSTS !== "1" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
];

const nextConfig = {
  images: { unoptimized: true },
  poweredByHeader: false,
  // Docker builds set NEXT_OUTPUT=standalone: a self-contained server in .next/standalone.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" } : {}),
  // Files read from disk at runtime must ship with the server.
  outputFileTracingIncludes: { "/**": ["./db/schema.sql", "./ai-prompts/**/*"] },
  // Database drivers run in Node only and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "sharp"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" }, // image and spreadsheet uploads from the admin
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
