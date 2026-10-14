"use server";

import { redirect } from "next/navigation";
import { currentUser, login, logout } from "@/lib/auth/session";
import { acceptInvitation, changePassword, createFirstAdmin, renameUser, requestPasswordReset, resetPassword, signUp } from "@/lib/auth/accounts";

export type FormState = { error?: string; field?: string; values?: Record<string, string>; done?: string } | undefined;
const val = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = val(fd, "email");
  const r = await login(email, val(fd, "password"));
  // React resets the form after an action, so hand the email back to refill it.
  if (!r.ok) return { error: r.reason === "throttled" ? "Too many failed attempts. Wait 15 minutes or reset your password." : r.reason === "disabled" ? "This account is disabled. Contact support." : "Email or password is incorrect.", values: { email } };
  const next = val(fd, "next");
  redirect(/^\/(admin|platform)(\/|$)/.test(next) ? next : "/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}

export async function signupAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = { name: val(fd, "name"), email: val(fd, "email") };
  const r = await signUp({ ...values, password: val(fd, "password") });
  if (!r.ok) return { error: r.error, field: r.field, values };
  redirect("/admin/new");
}

export async function forgotAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requestPasswordReset(val(fd, "email"));
  return { done: "If an account exists for that address, we sent a link to reset the password. It expires in 60 minutes." };
}

export async function resetAction(token: string, _prev: FormState, fd: FormData): Promise<FormState> {
  if (val(fd, "password") !== val(fd, "confirm")) return { error: "The two passwords do not match.", field: "confirm" };
  const r = await resetPassword(token, val(fd, "password"));
  if (!r.ok) return { error: r.error, field: r.field };
  redirect("/admin?reset=1");
}

export async function acceptInviteAction(token: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const me = await currentUser();
  const values = { name: val(fd, "name") };
  const r = await acceptInvitation(token, me ? { id: me.id } : null, me ? undefined : { name: values.name, password: val(fd, "password") });
  if (!r.ok) return { error: r.error, field: r.field, values };
  redirect(`/admin/${r.siteId}`);
}

export async function accountAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await currentUser();
  if (!me) redirect("/admin/login");
  if (fd.get("intent") === "name") {
    const r = await renameUser(me.id, val(fd, "name"));
    return r.ok ? { done: "Name saved." } : { error: r.error, field: r.field };
  }
  if (val(fd, "password") !== val(fd, "confirm")) return { error: "The two passwords do not match.", field: "confirm" };
  const r = await changePassword(me.id, val(fd, "current"), val(fd, "password"));
  return r.ok ? { done: "Password changed. You were signed out on other devices." } : { error: r.error, field: r.field };
}

/** First run: the very first account becomes the platform admin. Closed as soon as any account exists. */
export async function setupAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = { name: val(fd, "name"), email: val(fd, "email") };
  const r = await createFirstAdmin({ ...values, password: val(fd, "password"), code: val(fd, "code") });
  if (!r.ok) return { error: r.error, field: r.field, values };
  redirect("/platform");
}
