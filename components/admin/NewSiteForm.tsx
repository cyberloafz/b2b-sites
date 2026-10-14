"use client";

import { useActionState } from "react";
import { startGenerationAction, type StartState } from "@/app/admin/new/actions";

type FieldProps = { name: string; label: string; hint?: string; optional?: boolean; type?: string; placeholder?: string; area?: boolean; rows?: number };

// Declared outside the form so inputs keep their identity (and what the user typed) across re-renders.
function Field({ name, label, hint, optional, type = "text", placeholder, area, rows, v, e }: FieldProps & { v: Record<string, string>; e: Record<string, string> }) {
  return (
    <div className={`fld${e[name] ? " has-err" : ""}`}>
      <label htmlFor={name}>{label} {optional && <span className="opt">optional</span>}</label>
      {area
        ? <textarea id={name} name={name} rows={rows ?? 3} defaultValue={v[name]} placeholder={placeholder} aria-invalid={!!e[name]} aria-describedby={e[name] ? `${name}-err` : undefined} />
        : <input id={name} name={name} type={type} defaultValue={v[name]} placeholder={placeholder} aria-invalid={!!e[name]} aria-describedby={e[name] ? `${name}-err` : undefined} />}
      {hint && <p className="hint">{hint}</p>}
      {e[name] && <p className="err" id={`${name}-err`}>{e[name]}</p>}
    </div>
  );
}

/**
 * Step 1 of AI generation: what the company tells us. Everything on the generated site comes from
 * these answers and the product sheet — the AI is not allowed to add facts of its own.
 */
export function NewSiteForm() {
  const [state, action, pending] = useActionState<StartState, FormData>(startGenerationAction, {});
  const v = state.values ?? {};
  const e = state.fields ?? {};

  return (
    <form action={action} className="new-site" key={JSON.stringify(v).length /* keep typed values after an error */}>
      {state.error && <div className="err-box" role="alert">{state.error}{Object.keys(e).some((k) => k === "logo" || k === "sheet") ? null : " Files need to be attached again."}</div>}

      <section className="card">
        <h2>Company</h2>
        <div className="grid2">
          <Field v={v} e={e} name="legalName" label="Legal company name" placeholder="Prairie Pantry Co-Packing, LLC" />
          <Field v={v} e={e} name="brandName" label="Brand name" hint="Shown in the header and page titles." placeholder="Prairie Pantry" />
          <Field v={v} e={e} name="websiteUrl" label="Website address" type="url" placeholder="https://www.example.com" hint="The domain the site will use. You can connect it later." />
          <Field v={v} e={e} name="foundedYear" label="Year founded" optional type="number" />
          <Field v={v} e={e} name="street" label="Street address" />
          <Field v={v} e={e} name="city" label="City" />
          <Field v={v} e={e} name="state" label="State" placeholder="NE" hint="2-letter code" />
          <Field v={v} e={e} name="zip" label="ZIP code" />
          <Field v={v} e={e} name="phone" label="Phone" type="tel" placeholder="(402) 555-0187" />
          <Field v={v} e={e} name="email" label="Public email" type="email" />
          <Field v={v} e={e} name="inquiryEmail" label="Send inquiries to" type="email" optional hint="Defaults to the public email." />
        </div>
      </section>

      <section className="card">
        <h2>What you make</h2>
        <Field v={v} e={e} name="industry" label="Industry" placeholder="food co-packing, skincare contract manufacturing, CNC machining…" />
        <Field v={v} e={e} name="whatYouMake" label="What you make and for whom" area rows={4} hint="Two or three plain sentences. This is the main source for the copy." />
        <Field v={v} e={e} name="audience" label="Who buys from you" placeholder="food brands, regional grocers and restaurant groups" />
        <fieldset className="grp">
          <legend>Services (1–4)</legend>
          <p className="hint">Each service gets its own page. Two or more also add service cards to the home page.</p>
          {[0, 1, 2, 3].map((i) => (
            <div className="grid2" key={i}>
              <Field v={v} e={e} name={`service${i}Name`} label={`Service ${i + 1} name`} optional={i > 0} placeholder={i === 0 ? "Private Label" : ""} />
              <Field v={v} e={e} name={`service${i}Desc`} label="What it includes" optional={i > 0} area rows={2} />
            </div>
          ))}
        </fieldset>
      </section>

      <section className="card">
        <h2>Facts buyers check</h2>
        <p className="hint">Only what you enter here appears on the site. Leave a field empty rather than guess — empty facts are simply left out.</p>
        <div className="grid2">
          <Field v={v} e={e} name="minimumOrder" label="Minimum order" optional placeholder="500 units per SKU" />
          <Field v={v} e={e} name="leadTime" label="Typical lead time" optional placeholder="4–6 weeks" />
          <Field v={v} e={e} name="capacity" label="Capacity / equipment" optional />
        </div>
        <Field v={v} e={e} name="certifications" label="Certifications" optional area hint="One per line, exactly as on your certificates." />
        <Field v={v} e={e} name="differentiators" label="Why buyers choose you" optional area hint="One per line, facts only." />
        <Field v={v} e={e} name="keywords" label="Search phrases you want to be found for" optional area rows={2} hint="Separate with commas or new lines." />
      </section>

      <section className="card">
        <h2>Customer testimonials <span className="opt">optional</span></h2>
        <p className="hint">Real quotes you have permission to publish. The AI never writes testimonials.</p>
        {[0, 1, 2].map((i) => (
          <div className="grid3" key={i}>
            <Field v={v} e={e} name={`t${i}Quote`} label={`Quote ${i + 1}`} optional area rows={2} />
            <Field v={v} e={e} name={`t${i}Name`} label="Name" optional />
            <Field v={v} e={e} name={`t${i}Company`} label="Company" optional />
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Look and files</h2>
        <div className="grid2">
          <div className="fld">
            <label htmlFor="tone">Tone of voice</label>
            <select id="tone" name="tone" defaultValue={v.tone ?? "plain-spoken"}>
              <option value="plain-spoken">Plain-spoken</option>
              <option value="premium">Premium</option>
              <option value="technical">Technical</option>
            </select>
          </div>
          <div className="fld">
            <label htmlFor="stylePack">Style</label>
            <select id="stylePack" name="stylePack" defaultValue={v.stylePack ?? "auto"}>
              <option value="auto">Choose for me from my industry</option>
              <option value="natural-organic">Natural &amp; organic</option>
              <option value="industrial-solid">Industrial &amp; solid</option>
              <option value="clinical-clean">Clinical &amp; clean</option>
              <option value="modern-tech">Modern tech</option>
            </select>
          </div>
          <div className={`fld${e.logo ? " has-err" : ""}`}>
            <label htmlFor="logo">Logo <span className="opt">optional</span></label>
            <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
            <p className="hint">PNG, JPG, WebP or SVG. Its main colour becomes the brand colour (adjusted for readable contrast).</p>
            {e.logo && <p className="err">{e.logo}</p>}
          </div>
          <div className={`fld${e.sheet ? " has-err" : ""}`}>
            <label htmlFor="sheet">Product spreadsheet <span className="opt">optional</span></label>
            <input id="sheet" name="sheet" type="file" accept=".csv,.xlsx,text/csv" />
            <p className="hint">CSV or Excel with one row per product and a category column. Each category becomes its own page. You will check the columns on the next screen.</p>
            {e.sheet && <p className="err">{e.sheet}</p>}
          </div>
        </div>
      </section>

      <div className="row">
        <button className="primary" disabled={pending}>{pending ? "Planning your site…" : "Plan my site"}</button>
        <span className="muted">Next you review the pages before any copy is written.</span>
      </div>
    </form>
  );
}
