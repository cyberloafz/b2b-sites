import { currentUser } from "@/lib/auth/session";
import { listInquiries, toCsv } from "@/lib/repo/inquiries";

/** CSV download of the inquiries matching the current filters (opens cleanly in Excel). */
export async function GET(req: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const user = await currentUser();
  if (!user?.sites.some((s) => s.siteId === siteId)) return new Response("Not allowed", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await listInquiries(siteId, { ...sp, spam: sp.spam === "1" }, 10000);
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="inquiries-${siteId}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
