"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { importProductsAction, parseSheetAction } from "@/app/admin/[site]/actions";

type Field = { key: string; label: string; required: boolean };
type Parsed = { headers: string[]; rows: string[][]; mapping: Record<string, number> };
type RowResult = { row: number; name: string; status: "created" | "updated" | "failed"; message?: string };

export function ImportWizard({ siteId, fields }: { siteId: string; fields: Field[] }) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [pending, start] = useTransition();
  const missing = fields.filter((f) => f.required && mapping[f.key] === undefined);

  if (results) {
    const ok = results.filter((r) => r.status !== "failed");
    const bad = results.filter((r) => r.status === "failed");
    return (
      <section className="card">
        <h2>Import finished</h2>
        <p>
          <span className="pill good">{results.filter((r) => r.status === "created").length} created</span>{" "}
          <span className="pill">{results.filter((r) => r.status === "updated").length} updated</span>{" "}
          {bad.length > 0 && <span className="pill bad">{bad.length} need fixing</span>}
        </p>
        {bad.length > 0 && (
          <table className="list">
            <thead><tr><th>Row</th><th>Product</th><th>What to fix</th></tr></thead>
            <tbody>{bad.map((r) => <tr key={r.row}><td className="num">{r.row}</td><td>{r.name}</td><td>{r.message}</td></tr>)}</tbody>
          </table>
        )}
        {ok.length > 0 && <p className="muted" style={{ marginTop: 10 }}>Imported products are in the draft. Products marked “Needs content” have placeholders to fill in before publishing.</p>}
        <div className="row" style={{ marginTop: 10 }}>
          <Link className="btn primary" href={`/admin/${siteId}/products`}>Go to products</Link>
          <button onClick={() => { setResults(null); setParsed(null); }}>Import another file</button>
        </div>
      </section>
    );
  }

  if (!parsed) {
    return (
      <section className="card">
        <h2>1. Choose a file</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = await parseSheetAction(siteId, fd);
              if (!r.ok) { setError(r.error); return; }
              setError("");
              setParsed(r);
              setMapping(r.mapping as Record<string, number>);
            });
          }}
        >
          <div className="fld">
            <label htmlFor="sheet">Spreadsheet (.csv or .xlsx)</label>
            <input id="sheet" name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
          </div>
          {error && <p className="err" role="alert">{error}</p>}
          <button className="primary" disabled={pending}>{pending ? "Reading…" : "Read file"}</button>
        </form>
      </section>
    );
  }

  return (
    <>
      <section className="card">
        <h2>2. Match your columns</h2>
        <p className="muted">We guessed from your column names. Check each one; leave a field as “Not in my file” if you don’t have it.</p>
        <table className="list">
          <thead><tr><th>Website field</th><th>Column in your file</th><th>First row</th></tr></thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.key}>
                <td><label htmlFor={`map-${f.key}`}>{f.label}{f.required && " *"}</label></td>
                <td>
                  <select id={`map-${f.key}`} value={mapping[f.key] ?? ""} onChange={(e) => {
                    const v = e.target.value;
                    setMapping((m) => { const n = { ...m }; if (v === "") delete n[f.key]; else n[f.key] = Number(v); return n; });
                  }}>
                    <option value="">Not in my file</option>
                    {parsed.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </td>
                <td className="muted small">{mapping[f.key] !== undefined ? (parsed.rows[0][mapping[f.key]] ?? "").slice(0, 70) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>3. Import {parsed.rows.length} rows</h2>
        {missing.length > 0 && <p className="err">Match these required fields first: {missing.map((f) => f.label).join(", ")}.</p>}
        <div className="row">
          <button className="primary" disabled={pending || missing.length > 0} onClick={() => start(async () => {
            const r = await importProductsAction(siteId, parsed.headers, parsed.rows, mapping);
            setResults(r.results);
          })}>{pending ? "Importing…" : "Import products"}</button>
          <button onClick={() => setParsed(null)}>Choose a different file</button>
        </div>
      </section>
    </>
  );
}
