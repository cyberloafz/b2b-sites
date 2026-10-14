"use server";

import { revalidatePath } from "next/cache";
import { requireSite } from "@/lib/auth/session";
import { addDomain, refreshDomain, removeDomain, setPrimary } from "@/lib/domains";
import { siteChanged } from "@/lib/site-runtime";

/** Domains: owners only. Every change refreshes the host → site cache. */
const done = (siteId: string) => { siteChanged(siteId); revalidatePath(`/admin/${siteId}`, "layout"); };

export async function addDomainAction(siteId: string, _prev: { error?: string } | undefined, fd: FormData) {
  await requireSite(siteId, "owner");
  const r = await addDomain(siteId, String(fd.get("hostname") ?? ""));
  if (!r.ok) return { error: r.error };
  // A matching apex/www twin is suggested on the page; nothing is added silently.
  done(siteId);
  return { added: r.hostname };
}

export async function checkDomainAction(siteId: string, hostname: string) {
  await requireSite(siteId, "owner");
  await refreshDomain(siteId, hostname);
  done(siteId);
  return { ok: true };
}

export async function primaryDomainAction(siteId: string, hostname: string) {
  await requireSite(siteId, "owner");
  const r = await setPrimary(siteId, hostname);
  done(siteId);
  return r.ok ? { ok: true } : { ok: false, errors: [{ message: r.error }] };
}

export async function removeDomainAction(siteId: string, hostname: string) {
  await requireSite(siteId, "owner");
  const r = await removeDomain(siteId, hostname);
  done(siteId);
  return r.ok ? { ok: true } : { ok: false, errors: [{ message: r.error }] };
}
