"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";

/**
 * Builds an editing form from a JSON Schema (exported from the same zod schemas the renderer uses).
 * Adding a new block type therefore needs no admin code: its schema is its form.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type JS = Record<string, any>;
type Path = (string | number)[];
export type FieldError = { path: Path; message: string };
export type SaveResult = { ok: true; value?: unknown } | { ok: false; errors: FieldError[] };
export type Option = { value: string; label: string };
export type MediaItem = { url: string; alt: string; width: number | null; height: number | null };

export type FormCtx = {
  sitePaths?: string[];
  options?: { collections?: Option[]; products?: Option[]; services?: Option[] };
  media?: MediaItem[];
  upload?: (fd: FormData) => Promise<{ ok: true; media: MediaItem } | { ok: false; error: string }>;
};

const LABELS: Record<string, string> = {
  cta: "Button", primaryCta: "Primary button", secondaryCta: "Secondary button", primary: "Primary button", secondary: "Secondary button",
  href: "Link to", src: "Image", alt: "Alt text (describes the image)", subhead: "Subheading", eyebrow: "Small label above headline",
  seo: "Search engine settings", seoBody: "Long text at the bottom of the page", noindex: "Hide from search engines",
  viewAll: "\"View all\" link", imageSide: "Image position", logoText: "Text beside logo", legalLinks: "Legal links",
  showSpecSheet: "Show spec sheet link", priceNote: "Reference price (optional)", specSheetUrl: "Spec sheet URL",
  shortName: "Short name", foundedYear: "Year founded", phoneDisplay: "Phone (as displayed)", inquiryRecipients: "Inquiry emails go to",
  siteUrl: "Website address", primaryInk: "Text on primary", accentInk: "Text on accent", surfaceAlt: "Alternate background",
  headingCase: "Heading case", containerWidth: "Content width (px)", buttonStyle: "Button style", stylePack: "Style pack",
  permissionConfirmed: "I have permission to show these logos", submitLabel: "Button text", form: "Form type",
  ogImage: "Social share image URL", legalName: "Legal company name", brandName: "Brand name", composition: "Ingredients / materials",
};
const LONG_KEYS = new Set(["body", "intro", "description", "answer", "quote", "seoBody", "text", "usage", "blurb", "consentText"]);

export const humanize = (k: string) =>
  LABELS[k] ?? k.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

const keyOf = (p: Path) => p.join(".");

function resolve(s: JS, root: JS): JS {
  let cur = s;
  for (let i = 0; i < 10 && cur?.$ref; i++) {
    const parts = String(cur.$ref).replace(/^#\//, "").split("/");
    let t: any = root;
    for (const p of parts) t = t?.[p];
    cur = { ...t, ...Object.fromEntries(Object.entries(cur).filter(([k]) => k !== "$ref")) };
  }
  return cur;
}

const isImage = (s: JS) => s.type === "object" && s.properties?.src && s.properties?.alt;
const isLink = (s: JS) => s.type === "object" && s.properties && Object.keys(s.properties).sort().join() === "href,label";
const isHex = (s: JS) => typeof s.pattern === "string" && s.pattern.includes("0-9a-fA-F]{6}");

/** Smallest valid-looking value for a schema, used when adding list items or optional groups. */
export function emptyFor(s0: JS, root: JS): any {
  const s = resolve(s0, root);
  if (s.default !== undefined) return structuredClone(s.default);
  if (s.const !== undefined) return s.const;
  if (s.oneOf || s.anyOf) return emptyFor((s.oneOf ?? s.anyOf)[0], root);
  if (s.enum) return s.enum[0];
  switch (s.type) {
    case "object": {
      const o: JS = {};
      for (const k of s.required ?? []) o[k] = emptyFor(s.properties[k], root);
      return o;
    }
    case "array":
      if (s.prefixItems) return s.prefixItems.map((x: JS) => emptyFor(x, root));
      return Array.from({ length: s.minItems ?? 0 }, () => emptyFor(s.items, root));
    case "string": return "";
    case "number": case "integer": return s.minimum ?? 0;
    case "boolean": return false;
    default: return null;
  }
}

function summary(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v !== "object") return String(v);
  for (const k of ["title", "name", "question", "label", "headline", "text", "value", "quote", "alt"]) if (typeof v[k] === "string" && v[k]) return v[k];
  return "";
}

type NodeProps = { schema: JS; root: JS; path: Path; value: any; onChange: (v: any) => void; ctx: FormCtx; errors: Map<string, string>; name: string; required: boolean };

function Hint({ s }: { s: JS }) {
  return s.description ? <p className="hint">{s.description}</p> : null;
}
function Err({ errors, path }: { errors: Map<string, string>; path: Path }) {
  const m = errors.get(keyOf(path));
  return m ? <p className="err" role="alert">{m}</p> : null;
}

function StringField({ schema: s, path, value, onChange, ctx, errors, name, required }: NodeProps) {
  const id = "f-" + keyOf(path).replace(/\./g, "-");
  const v = value ?? "";
  const max = s.maxLength as number | undefined;
  const over = max !== undefined && v.length > max;
  const pick = (opts?: Option[]) => (
    <select id={id} value={v} onChange={(e) => onChange(e.target.value || (required ? "" : undefined))}>
      {!required && <option value="">—</option>}
      {required && !v && <option value="">Choose…</option>}
      {(opts ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
  let input: ReactNode;
  if (s.enum) {
    input = pick(s.enum.map((x: string) => ({ value: x, label: humanize(String(x)) })));
  } else if (name === "collection" && ctx.options?.collections) input = pick(ctx.options.collections);
  else if (name === "service" && ctx.options?.services) input = pick(ctx.options.services);
  else if (isHex(s)) {
    input = (
      <span className="color-row">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : "#000000"} onChange={(e) => onChange(e.target.value)} aria-label={`${humanize(name)} picker`} />
        <input id={id} value={v} onChange={(e) => onChange(e.target.value)} maxLength={7} />
      </span>
    );
  } else if (LONG_KEYS.has(name) || (max ?? 0) > 200 || (!max && s.maxLength === undefined && name === "body")) {
    input = <textarea id={id} value={v} rows={Math.min(14, Math.max(3, Math.ceil(v.length / 70)))} onChange={(e) => onChange(e.target.value === "" && !required ? undefined : e.target.value)} />;
  } else {
    input = (
      <input
        id={id}
        value={v}
        list={name === "href" && ctx.sitePaths ? "site-paths" : undefined}
        onChange={(e) => onChange(e.target.value === "" && !required ? undefined : e.target.value)}
      />
    );
  }
  return (
    <div className={`fld ${errors.has(keyOf(path)) ? "has-err" : ""}`}>
      <label htmlFor={id}>
        {humanize(name)}
        {!required && <span className="opt"> optional</span>}
        {max !== undefined && <span className={`count ${over ? "over" : ""}`}>{v.length}/{max}</span>}
      </label>
      {input}
      {/\[\[TODO:/.test(v) && <p className="todo">Replace the placeholder before publishing.</p>}
      <Hint s={s} />
      <Err errors={errors} path={path} />
    </div>
  );
}

function ImageField({ path, value, onChange, ctx, errors, name, required, schema, root }: NodeProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [upErr, setUpErr] = useState("");
  if (value == null) {
    return (
      <div className="fld">
        <span className="lbl">{humanize(name)} <span className="opt">optional</span></span>
        <button type="button" className="ghost" onClick={() => onChange(emptyFor(schema, root))}>+ Add image</button>
      </div>
    );
  }
  const choose = (m: MediaItem) => {
    onChange({ ...value, src: m.url, width: m.width ?? undefined, height: m.height ?? undefined, alt: value.alt || m.alt || "" });
    setOpen(false);
  };
  return (
    <fieldset className="grp img-fld">
      <legend>{humanize(name)}</legend>
      <div className="img-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value.src ? <img src={value.src} alt="" className="thumb" /> : <div className="thumb empty">No image</div>}
        <div className="img-actions">
          <button type="button" onClick={() => setOpen(!open)}>{open ? "Close library" : "Choose image"}</button>
          {ctx.upload && (
            <label className="upload">
              {busy ? "Uploading…" : "Upload new"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setBusy(true); setUpErr("");
                  const fd = new FormData(); fd.append("file", f); fd.append("alt", value.alt ?? "");
                  const r = await ctx.upload!(fd);
                  setBusy(false);
                  if (r.ok) choose(r.media); else setUpErr(r.error);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {!required && <button type="button" className="ghost danger" onClick={() => onChange(undefined)}>Remove</button>}
        </div>
      </div>
      {upErr && <p className="err">{upErr}</p>}
      {open && (
        <ul className="media-pick">
          {(ctx.media ?? []).map((m) => (
            <li key={m.url}>
              <button type="button" onClick={() => choose(m)} title={m.alt}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.alt} />
              </button>
            </li>
          ))}
          {!ctx.media?.length && <li className="hint">No images yet. Upload one.</li>}
        </ul>
      )}
      <StringField schema={schema.properties.alt} root={root} path={[...path, "alt"]} value={value.alt} onChange={(v) => onChange({ ...value, alt: v ?? "" })} ctx={ctx} errors={errors} name="alt" required />
      <Err errors={errors} path={[...path, "src"]} />
      <Err errors={errors} path={path} />
    </fieldset>
  );
}

function ArrayField(p: NodeProps) {
  const { schema: s, root, path, value, onChange, ctx, errors, name } = p;
  const items: any[] = Array.isArray(value) ? value : [];
  const itemSchema = resolve(s.items ?? {}, root);
  const picker = name === "categories" ? ctx.options?.collections : name === "products" && itemSchema.type === "string" ? ctx.options?.products : undefined;

  if (picker) {
    const set = new Set(items);
    return (
      <fieldset className={`grp ${errors.has(keyOf(path)) ? "has-err" : ""}`}>
        <legend>{humanize(name)} <span className="count">{items.length}{s.maxItems ? `/${s.maxItems}` : ""}</span></legend>
        <div className="checklist">
          {picker.map((o) => (
            <label key={o.value}>
              <input type="checkbox" checked={set.has(o.value)} onChange={(e) => onChange(e.target.checked ? [...items, o.value] : items.filter((x) => x !== o.value))} /> {o.label}
            </label>
          ))}
        </div>
        <Hint s={s} />
        <Err errors={errors} path={path} />
      </fieldset>
    );
  }

  if (s.prefixItems) {
    return (
      <fieldset className="grp">
        <legend>{humanize(name)}</legend>
        {value == null ? (
          <button type="button" className="ghost" onClick={() => onChange(emptyFor(s, root))}>+ Customise</button>
        ) : (
          <>
            {s.prefixItems.map((it: JS, i: number) => (
              <Node key={i} {...p} schema={it} path={[...path, i]} name={`${humanize(name)} ${i + 1}`} value={items[i]} required onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} />
            ))}
            <button type="button" className="ghost danger" onClick={() => onChange(undefined)}>Use defaults</button>
          </>
        )}
        <Hint s={s} />
      </fieldset>
    );
  }

  const min = s.minItems ?? 0, max = s.maxItems ?? Infinity;
  const move = (i: number, d: number) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  const simple = itemSchema.type === "string";
  return (
    <fieldset className={`grp arr ${errors.has(keyOf(path)) ? "has-err" : ""}`}>
      <legend>{humanize(name)} <span className="count">{items.length}{max !== Infinity ? `/${max}` : ""}</span></legend>
      <Hint s={s} />
      <Err errors={errors} path={path} />
      <ol className="items">
        {items.map((it, i) => (
          <li key={i} className="item">
            {simple ? (
              <div className="simple-item">
                <Node {...p} schema={itemSchema} path={[...path, i]} name={`${humanize(name).replace(/s$/, "")} ${i + 1}`} value={it} required onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} />
                <ItemTools i={i} n={items.length} min={min} move={move} remove={() => onChange(items.filter((_, j) => j !== i))} />
              </div>
            ) : (
              <ItemDetails initialOpen={items.length <= 3 || !summary(it)} forceOpen={errors.size > 0}>
                <summary>
                  <span className="item-title">{i + 1}. {summary(it) || "New item"}</span>
                  <ItemTools i={i} n={items.length} min={min} move={move} remove={() => onChange(items.filter((_, j) => j !== i))} />
                </summary>
                <Node {...p} schema={itemSchema} path={[...path, i]} name="" value={it} required onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} />
              </ItemDetails>
            )}
          </li>
        ))}
      </ol>
      {items.length < max && (
        <button type="button" className="ghost" onClick={() => onChange([...items, emptyFor(itemSchema, root)])}>+ Add {humanize(name).toLowerCase().replace(/s$/, "")}</button>
      )}
    </fieldset>
  );
}

/** Remembers whether the editor opened or closed a list item; it never snaps shut while typing. */
function ItemDetails({ initialOpen, forceOpen, children }: { initialOpen: boolean; forceOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initialOpen);
  return <details open={open || forceOpen} onToggle={(e) => setOpen(e.currentTarget.open)}>{children}</details>;
}

function ItemTools({ i, n, min, move, remove }: { i: number; n: number; min: number; move: (i: number, d: number) => void; remove: () => void }) {
  return (
    <span className="tools" onClick={(e) => e.preventDefault()}>
      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
      <button type="button" aria-label="Move down" disabled={i === n - 1} onClick={() => move(i, 1)}>↓</button>
      <button type="button" aria-label="Remove" className="danger" disabled={n <= min} onClick={remove}>✕</button>
    </span>
  );
}

function UnionField(p: NodeProps) {
  const { schema: s, root, path, value, onChange, name } = p;
  const branches: JS[] = (s.oneOf ?? s.anyOf).map((b: JS) => resolve(b, root));
  const disc = Object.keys(branches[0].properties ?? {}).find((k) => branches.every((b) => b.properties?.[k]?.const !== undefined));
  if (!disc) return <p className="hint">This field cannot be edited here.</p>;
  const current = branches.find((b) => b.properties[disc].const === value?.[disc]) ?? branches[0];
  const LABEL: Record<string, string> = { collection: "Products from one category", manual: "Products I choose", featured: "Featured products", related: "Same category as this product" };
  return (
    <fieldset className="grp">
      <legend>{humanize(name)}</legend>
      <div className="fld">
        <label htmlFor={"f-" + keyOf([...path, disc])}>Show</label>
        <select id={"f-" + keyOf([...path, disc])} value={current.properties[disc].const} onChange={(e) => onChange(emptyFor(branches.find((b) => b.properties[disc].const === e.target.value)!, root))}>
          {branches.map((b) => <option key={b.properties[disc].const} value={b.properties[disc].const}>{LABEL[b.properties[disc].const] ?? humanize(b.properties[disc].const)}</option>)}
        </select>
      </div>
      <ObjectFields {...p} schema={current} hide={[disc]} />
    </fieldset>
  );
}

function ObjectFields({ schema: s, root, path, value, onChange, ctx, errors, hide = [] }: NodeProps & { hide?: string[] }) {
  const v = value ?? {};
  const req = new Set<string>(s.required ?? []);
  return (
    <>
      {Object.entries<JS>(s.properties ?? {}).map(([k, child]) => {
        if (hide.includes(k)) return null;
        const r = resolve(child, root);
        if (r.const !== undefined && r.type !== "boolean") return null; // fixed values (block type) are not edited
        return (
          <Node
            key={k}
            schema={r}
            root={root}
            path={[...path, k]}
            name={k}
            value={v[k]}
            required={req.has(k)}
            ctx={ctx}
            errors={errors}
            onChange={(nv) => {
              const next = { ...v };
              if (nv === undefined) delete next[k];
              else next[k] = nv;
              onChange(next);
            }}
          />
        );
      })}
    </>
  );
}

function Node(p: NodeProps) {
  const s = resolve(p.schema, p.root);
  const props = { ...p, schema: s };
  if (s.oneOf || s.anyOf) return <UnionField {...props} />;
  if (isImage(s)) return <ImageField {...props} />;
  if (s.type === "array") return <ArrayField {...props} />;
  if (s.type === "object") {
    if (p.value == null && !p.required) {
      return (
        <div className="fld">
          <span className="lbl">{humanize(p.name)} <span className="opt">optional</span></span>
          <button type="button" className="ghost" onClick={() => p.onChange(emptyFor(s, p.root))}>+ Add {humanize(p.name).toLowerCase()}</button>
          <Hint s={s} />
        </div>
      );
    }
    // Block ids are system-managed; the form hides them at the top level.
    if (!p.name) return <ObjectFields {...props} hide={p.path.length === 0 ? ["id"] : []} />;
    return (
      <fieldset className={`grp ${isLink(s) ? "link-grp" : ""}`}>
        <legend>{humanize(p.name)}</legend>
        <Hint s={s} />
        <ObjectFields {...props} />
        {!p.required && <button type="button" className="ghost danger" onClick={() => p.onChange(undefined)}>Remove {humanize(p.name).toLowerCase()}</button>}
        <Err errors={p.errors} path={p.path} />
      </fieldset>
    );
  }
  if (s.type === "boolean") {
    const id = "f-" + keyOf(p.path);
    return (
      <div className="fld check">
        <input id={id} type="checkbox" checked={!!p.value} onChange={(e) => p.onChange(e.target.checked)} />
        <label htmlFor={id}>{humanize(p.name)}</label>
        <Hint s={s} />
        <Err errors={p.errors} path={p.path} />
      </div>
    );
  }
  if (s.type === "number" || s.type === "integer") {
    const id = "f-" + keyOf(p.path);
    return (
      <div className="fld num">
        <label htmlFor={id}>{humanize(p.name)}{!p.required && <span className="opt"> optional</span>}</label>
        <input id={id} type="number" value={p.value ?? ""} min={s.minimum} max={s.maximum} onChange={(e) => p.onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
        <Hint s={s} />
        <Err errors={p.errors} path={p.path} />
      </div>
    );
  }
  return <StringField {...props} />;
}

export function SchemaForm({
  schema, value: initial, onSave, ctx = {}, submitLabel = "Save", onSaved, extraActions,
}: {
  schema: JS;
  value: any;
  onSave: (value: any) => Promise<SaveResult>;
  ctx?: FormCtx;
  submitLabel?: string;
  onSaved?: (r: SaveResult) => void;
  extraActions?: ReactNode;
}) {
  const [value, setValue] = useState(initial);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [saved, setSaved] = useState<"idle" | "saved" | "dirty">("idle");
  const [pending, start] = useTransition();
  const errMap = useMemo(() => new Map(errors.map((e) => [keyOf(e.path), e.message])), [errors]);

  return (
    <form
      className="schema-form"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await onSave(value);
          if (r.ok) { setErrors([]); setSaved("saved"); } else { setErrors(r.errors); setSaved("dirty"); }
          onSaved?.(r);
        });
      }}
      onChange={() => setSaved("dirty")}
    >
      {ctx.sitePaths && (
        <datalist id="site-paths">
          {ctx.sitePaths.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
      {errors.length > 0 && (
        <div className="err-box" role="alert">
          <strong>Not saved. Fix {errors.length === 1 ? "this" : `these ${errors.length}`}:</strong>
          <ul>{errors.slice(0, 8).map((e, i) => <li key={i}>{e.path.length ? `${e.path.map((x) => (typeof x === "number" ? `#${x + 1}` : humanize(String(x)))).join(" › ")}: ` : ""}{e.message}</li>)}</ul>
        </div>
      )}
      <Node schema={schema} root={schema} path={[]} name="" value={value} required ctx={ctx} errors={errMap} onChange={(v) => { setValue(v); setSaved("dirty"); }} />
      <div className="form-bar">
        <button type="submit" className="primary" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
        {extraActions}
        <span className="status" role="status">{saved === "saved" ? "Saved to draft" : saved === "dirty" ? "Unsaved changes" : ""}</span>
      </div>
    </form>
  );
}
