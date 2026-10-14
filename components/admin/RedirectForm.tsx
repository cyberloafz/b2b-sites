"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addRedirectAction } from "@/app/admin/[site]/actions";

export function RedirectForm({ siteId, from: fixedFrom, paths, compact }: { siteId: string; from?: string; paths: string[]; compact?: boolean }) {
  const id = useId();
  const [from, setFrom] = useState(fixedFrom ?? "");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addRedirectAction(siteId, from, to);
          if (!r.ok) { setError(r.error); return; }
          setError(""); setTo(""); if (!fixedFrom) setFrom("");
          router.refresh();
        });
      }}
    >
      <datalist id={`${id}-paths`}>{paths.map((p) => <option key={p} value={p} />)}</datalist>
      {!fixedFrom && (
        <div className="fld" style={{ flex: 1, margin: 0 }}>
          <label htmlFor={`${id}-from`}>From (old address)</label>
          <input id={`${id}-from`} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="/old-page" required />
        </div>
      )}
      <div className="fld" style={{ flex: 1, margin: 0 }}>
        {compact ? <label htmlFor={`${id}-to`} className="sr-only">Redirect {fixedFrom} to</label> : <label htmlFor={`${id}-to`}>To (current page)</label>}
        <input id={`${id}-to`} value={to} onChange={(e) => setTo(e.target.value)} list={`${id}-paths`} placeholder="/products" required />
      </div>
      <button className={compact ? "" : "primary"} disabled={pending} style={{ alignSelf: "flex-end" }}>{pending ? "Saving…" : compact ? "Redirect" : "Add redirect"}</button>
      {error && <p className="err" role="alert" style={{ width: "100%" }}>{error}</p>}
    </form>
  );
}
