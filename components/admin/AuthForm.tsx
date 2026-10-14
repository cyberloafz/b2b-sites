"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/admin/auth-actions";

type FieldDef = { name: string; label: string; type?: string; autoComplete?: string; hint?: string; defaultValue?: string; readOnly?: boolean };

/** Small forms for sign-in, sign-up, password reset and invitations. Keeps typed values after an error. */
export function AuthForm({ action, fields, submit, pending: pendingLabel, hidden }: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  fields: FieldDef[]; submit: string; pending: string; hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} noValidate>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {fields.map((f) => {
        const bad = state?.field === f.name;
        return (
          <div key={f.name}>
            <label htmlFor={f.name}>{f.label}</label>
            <input id={f.name} name={f.name} type={f.type ?? "text"} autoComplete={f.autoComplete} readOnly={f.readOnly}
              defaultValue={state?.values?.[f.name] ?? f.defaultValue} key={`${f.name}-${state?.values?.[f.name] ?? ""}`}
              aria-invalid={bad} aria-describedby={bad ? "form-err" : f.hint ? `${f.name}-hint` : undefined} required />
            {f.hint && <p className="hint" id={`${f.name}-hint`}>{f.hint}</p>}
          </div>
        );
      })}
      {state?.error && <p className="err" id="form-err" role="alert">{state.error}</p>}
      {state?.done && <p className="ok" role="status">{state.done}</p>}
      <button className="primary" disabled={pending}>{pending ? pendingLabel : submit}</button>
    </form>
  );
}
