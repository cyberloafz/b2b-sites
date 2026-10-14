import { NextResponse } from "next/server";
import { processDue } from "@/lib/repo/inquiries";
import { runJobs } from "@/lib/jobs";
import { refreshPendingDomains } from "@/lib/domains";

/**
 * Housekeeping, every few minutes (Vercel Cron, or any scheduler) with header
 * `Authorization: Bearer $CRON_SECRET`:
 *   - retries CRM webhooks (after 1, 5 and 30 minutes) and failed emails
 *   - re-checks domains still waiting for DNS or a certificate
 *   - runs background jobs (AI site generation) that are queued or were interrupted
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 });
  const delivered = await processDue();
  const domains = await refreshPendingDomains();
  const jobs = await runJobs(200_000);
  return NextResponse.json({ ok: true, ...delivered, domains, jobs });
}
