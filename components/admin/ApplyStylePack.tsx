"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveThemeAction } from "@/app/admin/[site]/actions";
import { humanize } from "./SchemaForm";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ApplyStylePack({ siteId, packs }: { siteId: string; packs: { key: string; theme: any }[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="row">
      {packs.map((p) => (
        <button key={p.key} disabled={pending} onClick={() => start(async () => { await saveThemeAction(siteId, p.theme); router.refresh(); })}>
          <span style={{ display: "inline-flex", gap: 2 }}>
            {[p.theme.color.primary, p.theme.color.accent, p.theme.color.surfaceAlt].map((c: string) => (
              <span key={c} style={{ width: 12, height: 12, borderRadius: 3, background: c, border: "1px solid #0002" }} />
            ))}
          </span>
          {humanize(p.key.replace(/-/g, " "))}
        </button>
      ))}
    </div>
  );
}
