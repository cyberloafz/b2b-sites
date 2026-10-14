"use server";

import { revalidatePath } from "next/cache";
import { requireSite, type Role } from "@/lib/auth/session";
import { changeRole, inviteMember, removeMember, revokeInvitation } from "@/lib/auth/accounts";

/** Team management: owners only. */
export async function inviteAction(siteId: string, _prev: { error?: string; done?: string } | undefined, fd: FormData) {
  const { user } = await requireSite(siteId, "owner");
  const email = String(fd.get("email") ?? "");
  const r = await inviteMember(siteId, user, email, String(fd.get("role")) as Role);
  revalidatePath(`/admin/${siteId}/team`);
  return r.ok ? { done: `Invitation sent to ${email.trim().toLowerCase()}.` } : { error: r.error };
}

export async function revokeInviteAction(siteId: string, id: number) {
  await requireSite(siteId, "owner");
  await revokeInvitation(siteId, id);
  revalidatePath(`/admin/${siteId}/team`);
  return { ok: true };
}

export async function changeRoleAction(siteId: string, userId: number, role: Role) {
  await requireSite(siteId, "owner");
  const r = await changeRole(siteId, userId, role);
  revalidatePath(`/admin/${siteId}/team`);
  return r.ok ? { ok: true } : { ok: false, errors: [{ message: r.error }] };
}

export async function removeMemberAction(siteId: string, userId: number) {
  const { user } = await requireSite(siteId, "owner");
  const r = await removeMember(siteId, userId);
  revalidatePath(`/admin/${siteId}/team`);
  if (r.ok && userId === user.id) return { ok: true, left: true };
  return r.ok ? { ok: true } : { ok: false, errors: [{ message: r.error }] };
}
