"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { SchemaForm, type FormCtx, type SaveResult } from "./SchemaForm";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A schema form bound to one server action. `redirectBase` sends the user to `${redirectBase}/${value}`
 * when the action returns a new slug (e.g. after renaming or creating a product).
 */
export function EditForm({
  schema, value, action, ctx, submitLabel, redirectBase, extraActions,
}: {
  schema: any;
  value: any;
  action: (v: any) => Promise<SaveResult>;
  ctx?: FormCtx;
  submitLabel?: string;
  redirectBase?: string;
  extraActions?: ReactNode;
}) {
  const router = useRouter();
  return (
    <SchemaForm
      schema={schema}
      value={value}
      ctx={ctx}
      submitLabel={submitLabel}
      extraActions={extraActions}
      onSave={action}
      onSaved={(r) => {
        if (!r.ok) return;
        if (redirectBase && typeof r.value === "string") router.replace(`${redirectBase}/${r.value}`);
        else router.refresh();
      }}
    />
  );
}
