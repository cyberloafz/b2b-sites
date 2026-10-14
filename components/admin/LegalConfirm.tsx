"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmLegalAction } from "@/app/admin/[site]/actions";

export function LegalConfirm({ siteId }: { siteId: string }) {
  const [checked, setChecked] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div>
      <div className="fld check">
        <input id="legal-ok" type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <label htmlFor="legal-ok">I confirm these pages were reviewed and are accurate for our company.</label>
      </div>
      <button className="primary" disabled={!checked || pending} onClick={() => start(async () => { await confirmLegalAction(siteId); router.refresh(); })}>
        {pending ? "Saving…" : "Confirm and remove the sample notice"}
      </button>
      <p className="hint">Your name and the date are recorded.</p>
    </div>
  );
}
