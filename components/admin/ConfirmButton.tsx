"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Two-step destructive button (the admin never relies on browser confirm dialogs). */
export function ConfirmButton({
  label, confirmLabel, action, then,
}: {
  label: string;
  confirmLabel: string;
  action: () => Promise<{ ok: boolean; errors?: { message: string }[] } | void>;
  then?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!armed) return <button type="button" className="danger" onClick={() => setArmed(true)}>{label}</button>;
  return (
    <span className="row">
      <button
        type="button"
        className="danger"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await action();
            if (r && !r.ok) { setError(r.errors?.[0]?.message ?? "Could not complete this"); return; }
            setArmed(false);
            if (then) router.push(then);
            else router.refresh();
          })
        }
      >
        {pending ? "Working…" : confirmLabel}
      </button>
      <button type="button" onClick={() => setArmed(false)}>Cancel</button>
      {error && <span className="err">{error}</span>}
    </span>
  );
}
