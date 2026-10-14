import Link from "next/link";
import { AuthForm } from "@/components/admin/AuthForm";
import { findReset } from "@/lib/auth/accounts";
import { resetAction } from "../../auth-actions";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await findReset(token);
  return (
    <main className="login">
      <h1>Choose a new password</h1>
      {!r ? (
        <>
          <p className="err" role="alert">This link has expired or was already used.</p>
          <p><Link href="/admin/forgot">Send a new link</Link></p>
        </>
      ) : (
        <>
          <p className="muted">For {r.email}. You will be signed out on all other devices.</p>
          <AuthForm action={resetAction.bind(null, token)} submit="Save new password" pending="Saving…" fields={[
            { name: "password", label: "New password", type: "password", autoComplete: "new-password", hint: "At least 10 characters." },
            { name: "confirm", label: "Repeat the new password", type: "password", autoComplete: "new-password" },
          ]} />
        </>
      )}
    </main>
  );
}
