import { NextResponse, after } from "next/server";
import { InquiryEnvelope } from "@/schema/inquiry";
import { siteIdForHost } from "@/lib/repo/sites";
import { receiveInquiry } from "@/lib/repo/inquiries";

/**
 * Public endpoint for inquiry forms on every customer site. The site is found from the Host header.
 * Order: site → shape → human check (Turnstile, when configured) → rate limit & spam rules → store → reply → notify.
 */
export async function POST(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const siteId = (await siteIdForHost(host)) ?? process.env.DEFAULT_SITE ?? null;
  if (!siteId) return NextResponse.json({ ok: false, error: "unknown_site" }, { status: 404 });

  const parsed = InquiryEnvelope.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";

  if (process.env.TURNSTILE_SECRET_KEY) {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: parsed.data.turnstileToken ?? "", remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    }).then((r) => r.json()).catch(() => ({ success: false }));
    if (!res.success) return NextResponse.json({ ok: false, error: "human_check_failed" }, { status: 400 });
  }

  const r = await receiveInquiry(siteId, parsed.data, ip);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });

  // Emails and the CRM webhook run after the visitor already has their answer.
  after(async () => {
    for (const job of r.jobs) await job().catch((e) => console.error("[inquiry job]", e));
  });
  return NextResponse.json({ ok: true });
}
