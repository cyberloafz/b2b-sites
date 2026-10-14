"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { suspendSiteAction } from "@/app/platform/actions";

/** Suspending takes a site offline, so it asks for a reason (kept in the audit log) and a second click. */
export function SuspendSite({ siteId }: { siteId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open) return <button type="button" className="danger" onClick={() => setOpen(true)}>Suspend site</button>;
  return (
    <div className="suspend-box">
      <label htmlFor="suspend-reason">Reason (recorded in the audit log)</label>
      <input id="suspend-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. unpaid invoice, abuse report #123" />
      <span className="row">
        <button type="button" className="danger" disabled={pending} onClick={() => start(async () => {
          const r = await suspendSiteAction(siteId, reason);
          if (!r.ok) setError(r.errors?.[0]?.message ?? "Could not suspend"); else { setOpen(false); router.refresh(); }
        })}>{pending ? "Suspending…" : "Take the site offline"}</button>
        <button type="button" onClick={() => setOpen(false)}>Cancel</button>
      </span>
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}
