import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/admin/AuthForm";
import { currentUser } from "@/lib/auth/session";
import { googleEnabled } from "@/lib/auth/google";
import { accountAction } from "../auth-actions";

export const metadata = { title: "Your account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ linked?: string; error?: string }> }) {
  const me = await currentUser();
  if (!me) redirect("/admin/login");
  const { linked, error } = await searchParams;
  return (
    <main className="a-page narrow-page">
      <p><Link href="/admin?all=1">← Your sites</Link></p>
      <h1>Your account</h1>
      <p className="muted">{me.email}</p>
      {linked && <p className="ok" role="status">Google sign-in is now linked to this account.</p>}
      {error && <p className="err" role="alert">{error.slice(0, 200)}</p>}
      <section className="card auth-card">
        <h2>Name</h2>
        <AuthForm action={accountAction} submit="Save name" pending="Saving…" hidden={{ intent: "name" }} fields={[{ name: "name", label: "Your name", defaultValue: me.name, autoComplete: "name" }]} />
      </section>
      <section className="card auth-card">
        <h2>{me.hasPassword ? "Change password" : "Set a password"}</h2>
        <AuthForm action={accountAction} submit="Save password" pending="Saving…" hidden={{ intent: "password" }} fields={[
          ...(me.hasPassword ? [{ name: "current", label: "Current password", type: "password", autoComplete: "current-password" }] : []),
          { name: "password", label: "New password", type: "password", autoComplete: "new-password", hint: "At least 10 characters." },
          { name: "confirm", label: "Repeat the new password", type: "password", autoComplete: "new-password" },
        ]} />
      </section>
      {googleEnabled() && (
        <section className="card">
          <h2>Google sign-in</h2>
          {me.google ? <p>Linked. You can sign in with Google.</p> : <a className="btn" href="/api/auth/google/start?link=1">Link my Google account</a>}
        </section>
      )}
    </main>
  );
}
