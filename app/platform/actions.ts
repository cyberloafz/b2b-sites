"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { setPlatformAdmin, setSiteSuspended, setSupportAccess, setUserDisabled } from "@/lib/platform";

/** Platform operator actions. Each re-checks that the caller is a platform admin and is audited in lib/platform.ts. */
type R = { ok: boolean; errors?: { message: string }[] };
const out = (r: { ok: true } | { ok: false; error: string }): R => (r.ok ? { ok: true } : { ok: false, errors: [{ message: r.error }] });

export async function suspendSiteAction(siteId: string, reason: string): Promise<R> {
  const me = await requirePlatformAdmin();
  const r = await setSiteSuspended(me, siteId, true, reason);
  revalidatePath("/platform", "layout");
  return out(r);
}
export async function resumeSiteAction(siteId: string): Promise<R> {
  const me = await requirePlatformAdmin();
  const r = await setSiteSuspended(me, siteId, false, "");
  revalidatePath("/platform", "layout");
  return out(r);
}
export async function supportAccessAction(siteId: string, join: boolean): Promise<R> {
  const me = await requirePlatformAdmin();
  const r = await setSupportAccess(me, siteId, join);
  revalidatePath("/platform", "layout");
  return out(r);
}
export async function userDisabledAction(userId: number, disable: boolean): Promise<R> {
  const me = await requirePlatformAdmin();
  const r = await setUserDisabled(me, userId, disable);
  revalidatePath("/platform", "layout");
  return out(r);
}
export async function platformAdminAction(userId: number, admin: boolean): Promise<R> {
  const me = await requirePlatformAdmin();
  const r = await setPlatformAdmin(me, userId, admin);
  revalidatePath("/platform", "layout");
  return out(r);
}
