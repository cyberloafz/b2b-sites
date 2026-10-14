"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDomainAction, checkDomainAction, primaryDomainAction } from "@/app/admin/[site]/domain-actions";

export function AddDomainForm({ siteId }: { siteId: string }) {
  const [state, action, pending] = useActionState(addDomainAction.bind(null, siteId), undefined);
  return (
    <form action={action} className="row invite-form">
      <div className="fld grow">
        <label htmlFor="hostname">Domain</label>
        <input id="hostname" name="hostname" required placeholder="www.yourcompany.com" autoComplete="off" spellCheck={false} />
      </div>
      <button className="primary" disabled={pending}>{pending ? "Adding…" : "Add domain"}</button>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state && "added" in state && <p className="ok" role="status">Added {state.added}. Now create the DNS records below.</p>}
    </form>
  );
}

export function DomainButton({ siteId, hostname, kind, label }: { siteId: string; hostname: string; kind: "check" | "primary"; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <span className="row">
      <button type="button" disabled={pending} className={kind === "primary" ? "primary" : undefined} onClick={() => start(async () => {
        const r: { ok: boolean; errors?: { message: string }[] } = kind === "check" ? await checkDomainAction(siteId, hostname) : await primaryDomainAction(siteId, hostname);
        setError(r.ok ? "" : r.errors?.[0]?.message ?? "Could not complete this");
        router.refresh();
      })}>{pending ? (kind === "check" ? "Checking…" : "Saving…") : label}</button>
      {error && <span className="err" role="alert">{error}</span>}
    </span>
  );
}
