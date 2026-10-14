import { NextResponse } from "next/server";
import { one } from "@/db/client";
import { storageDriver } from "@/lib/storage";
import { provider as aiProvider } from "@/lib/ai/model";
import { provider as domainProvider } from "@/lib/domains";

/** For uptime monitors and load balancers: 200 when the app and its database answer. */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await one("SELECT 1");
    const queue = await one<{ n: number }>("SELECT count(*)::int AS n FROM jobs WHERE status IN ('queued','running')");
    return NextResponse.json({
      ok: true,
      database: process.env.DATABASE_URL ? "postgres" : "embedded (development only)",
      storage: storageDriver(),
      email: process.env.RESEND_API_KEY ? "resend" : "not configured",
      ai: aiProvider(),
      domains: domainProvider(),
      queuedJobs: queue?.n ?? 0,
    }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "database unavailable" }, { status: 503 });
  }
}
