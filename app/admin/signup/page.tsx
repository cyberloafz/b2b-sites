import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/admin/AuthForm";
import { signupAllowed } from "@/lib/auth/accounts";
import { googleEnabled } from "@/lib/auth/google";
import { signupAction } from "../auth-actions";

export const metadata = { title: "Create an account" };
export const dynamic = "force-dynamic"; // reads settings (ALLOW_SIGNUP, Google) at request time

export default function SignupPage() {
  if (!signupAllowed()) redirect("/admin/login");
  return (
    <main className="login">
      <h1>Create your account</h1>
      <p className="muted">Then build your company website with AI in a few minutes.</p>
      {googleEnabled() && (<><a className="btn google" href="/api/auth/google/start">Continue with Google</a><p className="or"><span>or</span></p></>)}
      <AuthForm action={signupAction} submit="Create account" pending="Creating…" fields={[
        { name: "name", label: "Your name", autoComplete: "name" },
        { name: "email", label: "Work email", type: "email", autoComplete: "email" },
        { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 10 characters." },
      ]} />
      <p className="small">Already have an account? <Link href="/admin/login">Sign in</Link></p>
    </main>
  );
}
