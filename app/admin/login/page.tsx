import Link from "next/link";
import { AuthForm } from "@/components/admin/AuthForm";
import { googleEnabled } from "@/lib/auth/google";
import { signupAllowed } from "@/lib/auth/accounts";
import { loginAction } from "../auth-actions";
import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/platform";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  if (await needsSetup()) redirect("/admin/setup"); // a fresh deployment has no accounts yet
  return (
    <main className="login">
      <h1>Sign in</h1>
      <p className="muted">Edit your website, products and inquiries.</p>
      {error && <p className="err" role="alert">{error.slice(0, 200)}</p>}
      {googleEnabled() && (
        <>
          <a className="btn google" href="/api/auth/google/start">Continue with Google</a>
          <p className="or"><span>or</span></p>
        </>
      )}
      <AuthForm action={loginAction} submit="Sign in" pending="Signing in…" hidden={next ? { next } : undefined} fields={[
        { name: "email", label: "Email", type: "email", autoComplete: "username" },
        { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
      ]} />
      <p className="small"><Link href="/admin/forgot">Forgot your password?</Link></p>
      {signupAllowed() && <p className="small">New here? <Link href="/admin/signup">Create an account</Link></p>}
    </main>
  );
}
