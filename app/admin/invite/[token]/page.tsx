import Link from "next/link";
import { AuthForm } from "@/components/admin/AuthForm";
import { findInvitation } from "@/lib/auth/accounts";
import { googleEnabled } from "@/lib/auth/google";
import { currentUser } from "@/lib/auth/session";
import { one } from "@/db/client";
import { acceptInviteAction } from "../../auth-actions";

export const metadata = { title: "Join a website team" };

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const inv = await findInvitation(token);
  const me = await currentUser();
  if (!inv) {
    return (
      <main className="login">
        <h1>Invitation not valid</h1>
        <p className="err" role="alert">This invitation has expired or was already used. Ask the site owner to send a new one.</p>
        <p><Link href="/admin/login">Go to sign in</Link></p>
      </main>
    );
  }
  const hasAccount = !me && !!(await one("SELECT 1 FROM users WHERE email = $1", [inv.email]));
  const roleText = inv.role === "owner" ? "an owner" : "an editor";
  return (
    <main className="login">
      <h1>Join {inv.site_name}</h1>
      <p className="muted">{inv.inviter ?? "A site owner"} invited <strong>{inv.email}</strong> to work on this website as {roleText}.</p>
      {error && <p className="err" role="alert">{error.slice(0, 200)}</p>}
      {me ? (
        <AuthForm action={acceptInviteAction.bind(null, token)} submit={`Join as ${me.email}`} pending="Joining…" fields={[]} />
      ) : hasAccount ? (
        <p>You already have an account. <Link href={`/admin/login?next=${encodeURIComponent(`/admin/invite/${token}`)}`}>Sign in</Link> to accept.</p>
      ) : (
        <>
          {googleEnabled() && (<><a className="btn google" href={`/api/auth/google/start?invite=${encodeURIComponent(token)}`}>Continue with Google</a><p className="or"><span>or create a password</span></p></>)}
          <AuthForm action={acceptInviteAction.bind(null, token)} submit="Create account and join" pending="Joining…" fields={[
            { name: "email", label: "Email", type: "email", defaultValue: inv.email, readOnly: true },
            { name: "name", label: "Your name", autoComplete: "name" },
            { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 10 characters." },
          ]} />
        </>
      )}
    </main>
  );
}
