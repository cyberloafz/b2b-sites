import Link from "next/link";
import { AuthForm } from "@/components/admin/AuthForm";
import { forgotAction } from "../auth-actions";

export const metadata = { title: "Reset your password" };
export const dynamic = "force-dynamic"; // reads settings (ALLOW_SIGNUP, Google) at request time

export default function ForgotPage() {
  return (
    <main className="login">
      <h1>Reset your password</h1>
      <p className="muted">Enter the email you sign in with. We will send you a link to choose a new password.</p>
      <AuthForm action={forgotAction} submit="Send reset link" pending="Sending…" fields={[{ name: "email", label: "Email", type: "email", autoComplete: "username" }]} />
      <p className="small"><Link href="/admin/login">Back to sign in</Link></p>
    </main>
  );
}
