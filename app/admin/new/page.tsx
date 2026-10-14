import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { provider } from "@/lib/ai/model";
import { NewSiteForm } from "@/components/admin/NewSiteForm";

export const metadata = { title: "New site" };

export default async function NewSitePage() {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  const p = provider();
  return (
    <main className="a-page narrow-page">
      <p><Link href="/admin">← Your sites</Link></p>
      <h1>Create a site with AI</h1>
      <p className="muted">
        Answer the questions, add your logo and product spreadsheet. You review the page plan first;
        then the copy is written block by block. Anything the AI cannot back with your answers is left as a
        marked placeholder you fill in before publishing.
      </p>
      {p === "mock" && (
        <div className="card notice">
          <strong>Demo mode.</strong> No AI model is connected (<code>ANTHROPIC_API_KEY</code> is not set), so copy is assembled
          from your answers with plain templates. Set the key to have the model write it.
        </div>
      )}
      <NewSiteForm />
    </main>
  );
}
