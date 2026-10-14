"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeRoleAction, inviteAction } from "@/app/admin/[site]/team-actions";

export function InviteForm({ siteId }: { siteId: string }) {
  const [state, action, pending] = useActionState(inviteAction.bind(null, siteId), undefined);
  return (
    <form action={action} className="row invite-form">
      <div className="fld grow">
        <label htmlFor="inv-email">Email</label>
        <input id="inv-email" name="email" type="email" required placeholder="name@company.com" />
      </div>
      <div className="fld">
        <label htmlFor="inv-role">Role</label>
        <select id="inv-role" name="role" defaultValue="editor">
          <option value="editor">Editor</option>
          <option value="owner">Owner</option>
        </select>
      </div>
      <button className="primary" disabled={pending}>{pending ? "Sending…" : "Send invitation"}</button>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.done && <p className="ok" role="status">{state.done}</p>}
    </form>
  );
}

export function RoleSelect({ siteId, userId, role, label }: { siteId: string; userId: number; role: "owner" | "editor"; label: string }) {
  const [value, setValue] = useState(role);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <span className="row">
      <select aria-label={label} value={value} disabled={pending} onChange={(e) => {
        const next = e.target.value as "owner" | "editor";
        start(async () => {
          const r = await changeRoleAction(siteId, userId, next);
          if (r.ok) { setValue(next); setError(""); router.refresh(); } else setError(r.errors?.[0]?.message ?? "Could not change the role");
        });
      }}>
        <option value="owner">Owner</option>
        <option value="editor">Editor</option>
      </select>
      {error && <span className="err" role="alert">{error}</span>}
    </span>
  );
}
