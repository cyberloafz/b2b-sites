import { redirect } from "next/navigation";
import { AuthForm } from "@/components/admin/AuthForm";
import { needsSetup } from "@/lib/platform";
import { setupAction } from "../auth-actions";

export const metadata = { title: "Set up the platform" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/admin/login");
  return (
    <main className="login">
      <h1>Set up your platform</h1>
      <p className="muted">Create the first account. It becomes the platform administrator: it can see every customer site and user.</p>
      <AuthForm action={setupAction} submit="Create admin account" pending="Creating…" fields={[
        ...(process.env.SETUP_CODE ? [{ name: "code", label: "Setup code", hint: "The SETUP_CODE value from the deployment settings." }] : []),
        { name: "name", label: "Your name", autoComplete: "name" },
        { name: "email", label: "Email", type: "email", autoComplete: "username" },
        { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 10 characters." },
      ]} />
    </main>
  );
}
