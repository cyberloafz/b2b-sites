"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryJobAction } from "@/app/admin/new/actions";

export function RetryButton({ siteId, jobId }: { siteId: string; jobId: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <span className="row">
      <button type="button" disabled={pending} onClick={() => start(async () => {
        const r = await retryJobAction(siteId, jobId);
        setMsg(r.ok ? "Done" : r.error ?? "Failed again");
        router.refresh();
      })}>{pending ? "Retrying…" : "Retry"}</button>
      {msg && <span className="small muted" role="status">{msg}</span>}
    </span>
  );
}
