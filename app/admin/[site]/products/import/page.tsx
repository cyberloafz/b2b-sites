import Link from "next/link";
import { requireSite } from "@/lib/auth/session";
import { IMPORT_FIELDS } from "@/lib/repo/import";
import { listCollections } from "@/lib/repo/editor";
import { ImportWizard } from "@/components/admin/ImportWizard";

export const metadata = { title: "Import products" };

export default async function ImportPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  await requireSite(siteId);
  const cols = await listCollections(siteId);
  return (
    <main className="a-page" style={{ maxWidth: 980 }}>
      <p><Link href={`/admin/${siteId}/products`}>← Products</Link></p>
      <h1>Import products</h1>
      <p className="sub">
        Upload a CSV or Excel file with one product per row. Rows whose name matches an existing product update it.
        Categories must already exist: {cols.map((c) => c.data.shortName).join(", ")}.
      </p>
      <ImportWizard siteId={siteId} fields={IMPORT_FIELDS.map((f) => ({ key: f.key, label: f.label, required: f.required }))} />
    </main>
  );
}
