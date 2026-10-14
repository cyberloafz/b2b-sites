"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMediaAltAction, uploadMediaAction } from "@/app/admin/[site]/actions";

type Item = { id: string; url: string; alt: string; width: number | null; height: number | null; filename: string; bytes: number };

export function MediaLibrary({ siteId, items }: { siteId: string; items: Item[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <form
        className="card row"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          start(async () => {
            const r = await uploadMediaAction(siteId, fd);
            if (!r.ok) setError(r.error);
            else { setError(""); form.reset(); router.refresh(); }
          });
        }}
      >
        <div className="fld" style={{ flex: 1, margin: 0 }}>
          <label htmlFor="up-file">Image</label>
          <input id="up-file" name="file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" required />
        </div>
        <div className="fld" style={{ flex: 2, margin: 0 }}>
          <label htmlFor="up-alt">Alt text</label>
          <input id="up-alt" name="alt" maxLength={125} placeholder="e.g. Amber dropper bottles on a filling line" required />
        </div>
        <button className="primary" disabled={pending} style={{ alignSelf: "flex-end" }}>{pending ? "Uploading…" : "Upload"}</button>
        {error && <p className="err" role="alert" style={{ width: "100%" }}>{error}</p>}
      </form>
      {!items.length && <p className="muted">No uploads yet.</p>}
      <ul className="media-grid">
        {items.map((m) => (
          <li key={m.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.url} alt={m.alt} loading="lazy" />
            <div className="meta">
              <span className="small muted">{m.width}×{m.height} · {Math.round(m.bytes / 1024)} KB</span>
              <label className="small" htmlFor={`alt-${m.id}`}>Alt text</label>
              <input id={`alt-${m.id}`} defaultValue={m.alt} maxLength={125} onBlur={(e) => e.target.value !== m.alt && start(async () => { await setMediaAltAction(siteId, m.id, e.target.value); router.refresh(); })} />
              <code className="small" style={{ wordBreak: "break-all" }}>{m.url}</code>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
