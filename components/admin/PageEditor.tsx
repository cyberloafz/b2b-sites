"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SchemaForm, type FormCtx, type SaveResult } from "./SchemaForm";
import { addBlockAction, blockOpAction, deletePageAction, moveBlockToAction, saveBlockAction, savePageSettingsAction } from "@/app/admin/[site]/actions";
import type { BlockType } from "@/schema/blocks";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Section = { id: number; block_id: string; type: BlockType; position: number; visible: boolean; data: any };

function summarize(d: any): string {
  for (const k of ["headline", "heading", "title", "text"]) if (typeof d?.[k] === "string") return d[k];
  if (d?.messages?.[0]?.text) return d.messages[0].text;
  if (d?.items?.[0]?.title) return d.items.map((i: any) => i.title).join(" · ");
  if (d?.cards) return d.cards.map((c: any) => c.title).join(" · ");
  if (d?.steps) return `${d.steps.length} steps`;
  if (d?.groups) return `${d.groups.reduce((n: number, g: any) => n + g.items.length, 0)} questions`;
  if (d?.categories) return `${d.categories.length} categories`;
  if (d?.form) return `${d.form} form`;
  return "";
}

export function PageEditor({
  siteId, page, sections, schemas, settingsSchema, ctx, addable, labels, initialSelected,
}: {
  siteId: string;
  page: { id: number; slug: string; name: string; template: string; seo: any };
  sections: Section[];
  schemas: Record<string, any>;
  settingsSchema: any;
  ctx: FormCtx;
  addable: { type: BlockType; name: string; hint: string }[];
  labels: Record<string, string>;
  initialSelected: number | "settings";
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<number | "settings">(initialSelected);
  const [previewKey, setPreviewKey] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [flash, setFlash] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<number | "page" | null>(null);
  const [pending, start] = useTransition();
  const frame = useRef<HTMLIFrameElement>(null);

  const current = typeof selected === "number" ? sections.find((s) => s.id === selected) : undefined;
  const previewSrc = `/preview/${siteId}${page.slug === "/" ? "" : page.slug}`;

  // After a block is deleted, select the first block. (A just-added block may not be in
  // `sections` yet while the refresh is in flight, so only react to blocks that disappeared.)
  const prevIds = useRef<number[]>(sections.map((s) => s.id));
  useEffect(() => {
    const ids = sections.map((s) => s.id);
    if (typeof selected === "number" && prevIds.current.includes(selected) && !ids.includes(selected)) setSelected(ids[0] ?? "settings");
    prevIds.current = ids;
  }, [sections, selected]);

  // Keep the selected block in the address bar, so reloads and the back button return to it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (typeof selected === "number") params.set("block", String(selected));
    else params.delete("block");
    // Next.js syncs native replaceState calls with its router (pass null state).
    window.history.replaceState(null, "", `?${params}`);
  }, [selected]);

  // Scroll the preview to the selected block.
  useEffect(() => {
    const go = () => frame.current?.contentDocument?.getElementById(`blk-${current?.block_id}`)?.scrollIntoView({ block: "start" });
    go();
    const f = frame.current;
    f?.addEventListener("load", go);
    return () => f?.removeEventListener("load", go);
  }, [current?.block_id, previewKey]);

  const refresh = () => {
    router.refresh();
    setPreviewKey((k) => k + 1);
  };
  // The form remounts with fresh server data after a save, so the confirmation lives here.
  const saved = (r: SaveResult) => {
    if (!r.ok) return;
    setFlash("Saved to draft. Preview updated.");
    setTimeout(() => setFlash(""), 4000);
    refresh();
  };
  const run = (fn: () => Promise<{ ok: boolean; errors?: { message: string }[]; value?: unknown }>, then?: (v: any) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setMessage(r.errors?.[0]?.message ?? "Something went wrong");
      else { setMessage(""); then?.(r.value); }
      refresh();
    });

  return (
    <div className="editor">
      <aside className="blocks" aria-label="Blocks on this page">
        <h2>{page.name}</h2>
        <button className={selected === "settings" ? "primary" : ""} style={{ width: "100%", marginBottom: 8 }} onClick={() => setSelected("settings")}>
          Page settings &amp; SEO
        </button>
        <ol className="blk-list">
          {sections.map((s, i) => (
            <li
              key={s.id}
              className={[selected === s.id ? "sel" : "", s.visible ? "" : "off", overId === s.id ? "drag-over" : ""].join(" ")}
              draggable
              onDragStart={() => setDragId(s.id)}
              onDragOver={(e) => { e.preventDefault(); setOverId(s.id); }}
              onDragLeave={() => setOverId(null)}
              onDrop={() => { if (dragId && dragId !== s.id) run(() => moveBlockToAction(siteId, dragId, i)); setDragId(null); setOverId(null); }}
            >
              <button className="blk-btn" onClick={() => setSelected(s.id)} aria-current={selected === s.id}>
                <span className="blk-name">{labels[s.type] ?? s.type}{!s.visible && " (hidden)"}</span>
                <span className="blk-sum">{summarize(s.data)}</span>
              </button>
              {selected === s.id && (
                <div className="blk-tools">
                  <button aria-label="Move up" disabled={i === 0 || pending} onClick={() => run(() => blockOpAction(siteId, s.id, "up", i))}>↑</button>
                  <button aria-label="Move down" disabled={i === sections.length - 1 || pending} onClick={() => run(() => blockOpAction(siteId, s.id, "down", i))}>↓</button>
                  <button disabled={pending} onClick={() => run(() => blockOpAction(siteId, s.id, s.visible ? "hide" : "show"))}>{s.visible ? "Hide" : "Show"}</button>
                  {s.type !== "product_detail" && <button disabled={pending} onClick={() => run(() => blockOpAction(siteId, s.id, "duplicate"), (id) => setSelected(id))}>Duplicate</button>}
                  {confirmDelete === s.id ? (
                    <>
                      <button className="danger" onClick={() => { setConfirmDelete(null); run(() => blockOpAction(siteId, s.id, "delete")); }}>Confirm delete</button>
                      <button onClick={() => setConfirmDelete(null)}>Keep</button>
                    </>
                  ) : (
                    <button className="danger" onClick={() => setConfirmDelete(s.id)}>Delete</button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
        <div className="add-menu">
          <button className="ghost" style={{ width: "100%" }} onClick={() => setAdding(!adding)} aria-expanded={adding}>{adding ? "Close" : "+ Add block"}</button>
          {adding && (
            <div className="add-grid" style={{ marginTop: 8 }}>
              <p className="muted small">Added below the selected block.</p>
              {addable.map((a) => (
                <button key={a.type} disabled={pending} onClick={() => {
                  const pos = current ? sections.indexOf(current) : sections.length - 1;
                  run(() => addBlockAction(siteId, page.id, a.type, pos), (id) => { setSelected(id); setAdding(false); });
                }}>
                  {a.name}<small>{a.hint}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        {message && <p className="err" role="alert">{message}</p>}
      </aside>

      <section className="form-pane" aria-label="Edit">
        <p className="flash" role="status">{flash}</p>
        {selected === "settings" ? (
          <>
            <h2>Page settings</h2>
            <SchemaForm
              key={`settings-${page.id}`}
              schema={settingsSchema}
              value={{ name: page.name, slug: page.slug, template: page.template, seo: page.seo }}
              ctx={ctx}
              onSave={(v) => savePageSettingsAction(siteId, page.id, v) as Promise<SaveResult>}
              onSaved={saved}
              extraActions={page.slug !== "/" && (
                confirmDelete === "page" ? (
                  <>
                    <button type="button" className="danger" onClick={() => start(async () => { const r = await deletePageAction(siteId, page.id); if (r.ok) router.push(`/admin/${siteId}/pages`); else setMessage(r.errors[0].message); })}>Confirm: delete page</button>
                    <button type="button" onClick={() => setConfirmDelete(null)}>Keep page</button>
                  </>
                ) : <button type="button" className="danger" onClick={() => setConfirmDelete("page")}>Delete page</button>
              )}
            />
            <p className="hint">Changing the address creates a permanent redirect from the old one automatically.</p>
          </>
        ) : current ? (
          <>
            <h2>{labels[current.type] ?? current.type} <span className="muted small">{current.block_id}</span></h2>
            <SchemaForm
              key={`blk-${current.id}`}
              schema={schemas[current.type]}
              value={current.data}
              ctx={ctx}
              onSave={(v) => saveBlockAction(siteId, current.id, v) as Promise<SaveResult>}
              onSaved={saved}
            />
          </>
        ) : (
          <p className="muted">This page has no blocks yet. Add one from the left.</p>
        )}
      </section>

      <section className={`preview-pane ${mobile ? "mobile" : ""}`} aria-label="Preview">
        <div className="preview-bar">
          <span className="grow">Draft preview · {page.slug}</span>
          <button onClick={() => setMobile(!mobile)} aria-pressed={mobile}>{mobile ? "Desktop" : "Phone"} view</button>
          <button onClick={() => setPreviewKey((k) => k + 1)}>Reload</button>
          <a className="btn" href={previewSrc} target="_blank" rel="noopener">Open</a>
        </div>
        <iframe key={previewKey} ref={frame} className="preview-frame" src={previewSrc} title="Draft preview" />
      </section>
    </div>
  );
}
