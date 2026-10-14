"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runSeoCheckAction } from "@/app/admin/[site]/actions";

export function SeoCheckButton({ siteId }: { siteId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <span className="row">
      <button disabled={pending} onClick={() => start(async () => {
        const r = await runSeoCheckAction(siteId);
        setMsg(`${r.errors} errors, ${r.warnings} warnings`);
        router.refresh();
      })}>{pending ? "Checking every page…" : "Run check now"}</button>
      {msg && <span className="muted small" role="status">{msg}</span>}
    </span>
  );
}
