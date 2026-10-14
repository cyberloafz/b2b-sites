import { requireSite } from "@/lib/auth/session";
import { getSiteRow } from "@/lib/repo/sites";
import { editorContext } from "@/lib/admin/context";
import { blockJsonSchema } from "@/lib/admin/schemas";
import { EditForm } from "@/components/admin/EditForm";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { saveGlobalAction, uploadMediaAction } from "../actions";

export const metadata = { title: "Header & footer" };

export default async function GlobalsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  await requireSite(siteId);
  const row = (await getSiteRow(siteId))!;
  const ctx = { ...(await editorContext(siteId)), upload: uploadMediaAction.bind(null, siteId) };
  const g = row.globals;
  return (
    <main className="a-page">
      <h1>Header &amp; footer</h1>
      <p className="sub">These appear on every page of the site.</p>
      <section className="card">
        <h2>Announcement bar</h2>
        {g.announcement ? (
          <EditForm schema={blockJsonSchema("announcement_bar")} value={g.announcement} action={saveGlobalAction.bind(null, siteId, "announcement")} ctx={ctx}
            extraActions={<ConfirmButton label="Remove announcement bar" confirmLabel="Confirm: remove" action={saveGlobalAction.bind(null, siteId, "announcement", null)} />} />
        ) : (
          <EditForm schema={blockJsonSchema("announcement_bar")} value={{ messages: [{ text: "" }] }} action={saveGlobalAction.bind(null, siteId, "announcement")} ctx={ctx} submitLabel="Add announcement bar" />
        )}
      </section>
      <section className="card">
        <h2>Header</h2>
        <EditForm schema={blockJsonSchema("header")} value={g.header} action={saveGlobalAction.bind(null, siteId, "header")} ctx={ctx} />
      </section>
      <section className="card">
        <h2>Footer</h2>
        <EditForm schema={blockJsonSchema("footer")} value={g.footer} action={saveGlobalAction.bind(null, siteId, "footer")} ctx={ctx} />
      </section>
    </main>
  );
}
