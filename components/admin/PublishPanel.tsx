"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishAction } from "@/app/admin/[site]/actions";

export function PublishPanel({ siteId, canPublish, dirty }: { siteId: string; canPublish: boolean; dirty: boolean }) {
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      style={{ marginTop: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await publishAction(siteId, note);
          if (r.ok) { setMsg({ ok: true, text: `Published as version ${r.versionNumber}. The live site is updated.` }); setNote(""); }
          else setMsg({ ok: false, text: "stage" in r && r.stage === "seo"
            ? `Not published: the SEO check found ${r.issues.length} error(s). They are listed below with links to fix them.`
            : `Not published: ${r.issues.length} item(s) to fix.` });
          router.refresh();
        });
      }}
    >
      <div className="fld">
        <label htmlFor="pub-note">What changed? <span className="opt">optional</span></label>
        <input id="pub-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. New eye care products, updated hero" />
      </div>
      <div className="row">
        <button className="primary" disabled={!canPublish || pending}>{pending ? "Checking & publishing…" : "Publish to live site"}</button>
        {!dirty && <span className="muted">The draft matches the live site.</span>}
      </div>
      {msg && <p className={msg.ok ? "" : "err"} role="status" style={{ marginTop: 8 }}>{msg.text}</p>}
    </form>
  );
}
