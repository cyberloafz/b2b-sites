"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { InquiryEnvelope, type InquiryForm as FormType } from "@/schema/inquiry";
import { readSource } from "@/components/SourceTracker";

type ProductOption = { slug: string; name: string; category: string };

type Props = {
  form: FormType;
  submitLabel: string;
  products: ProductOption[];
  /** Static demo export has no server: submissions are validated, then shown the thank-you page. */
  demo: boolean;
};

const QUANTITIES = ["1–5 gallons (bulk)", "5–50 gallons (bulk)", "250–1,000 filled units", "1,000–5,000 filled units", "5,000+ filled units", "Not sure yet"];
const TIMELINES = ["Within 1 month", "1–3 months", "3–6 months", "Just researching"];
const BUDGETS = ["Under $5,000", "$5,000–$15,000", "$15,000–$50,000", "Over $50,000", "Not sure yet"];
const PRODUCT_TYPES = ["Facial skincare", "Body care", "Hair care", "Lip care", "Other"];

function Field(props: { label: string; name: string; type?: string; required?: boolean; autoComplete?: string; defaultValue?: string; error?: string; hint?: string; maxLength?: number }) {
  const id = `f-${props.name}`;
  return (
    <div className="field">
      <label htmlFor={id}>
        {props.label}
        {props.required ? <span aria-hidden="true"> *</span> : <span className="muted small"> (optional)</span>}
      </label>
      <input
        id={id}
        name={props.name}
        type={props.type ?? "text"}
        required={props.required}
        autoComplete={props.autoComplete}
        defaultValue={props.defaultValue}
        maxLength={props.maxLength}
        aria-invalid={!!props.error}
        aria-describedby={props.error ? `${id}-err` : props.hint ? `${id}-hint` : undefined}
      />
      {props.hint && !props.error && <p id={`${id}-hint`} className="muted small">{props.hint}</p>}
      {props.error && <p id={`${id}-err`} className="field-error" role="alert">{props.error}</p>}
    </div>
  );
}

function Select(props: { label: string; name: string; options: string[]; required?: boolean; defaultValue?: string; error?: string }) {
  const id = `f-${props.name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}{props.required && <span aria-hidden="true"> *</span>}</label>
      <select id={id} name={props.name} required={props.required} defaultValue={props.defaultValue ?? ""} aria-invalid={!!props.error}>
        <option value="" disabled>Choose one</option>
        {props.options.map((o) => <option key={o}>{o}</option>)}
      </select>
      {props.error && <p className="field-error" role="alert">{props.error}</p>}
    </div>
  );
}

function TextArea(props: { label: string; name: string; required?: boolean; error?: string; rows?: number }) {
  const id = `f-${props.name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}{props.required ? <span aria-hidden="true"> *</span> : <span className="muted small"> (optional)</span>}</label>
      <textarea id={id} name={props.name} required={props.required} rows={props.rows ?? 4} aria-invalid={!!props.error} />
      {props.error && <p className="field-error" role="alert">{props.error}</p>}
    </div>
  );
}

export function InquiryFormClient({ form, submitLabel, products, demo }: Props) {
  const router = useRouter();
  const opened = useRef(Date.now());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [step, setStep] = useState(0);
  const [prefill, setPrefill] = useState<string>("");
  const [preview, setPreview] = useState(false);
  const turnstileKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("product");
    if (p) setPrefill(p);
    setPreview(window.location.pathname.startsWith("/preview/"));
    // Cloudflare Turnstile (invisible for most people) when a site key is configured.
    if (turnstileKey && !document.querySelector("script[data-turnstile]")) {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      s.dataset.turnstile = "1";
      document.head.appendChild(s);
    }
  }, [turnstileKey]);
  const prefillName = useMemo(() => products.find((p) => p.slug === prefill)?.name ?? "", [prefill, products]);
  const byCategory = useMemo(() => {
    const m = new Map<string, ProductOption[]>();
    for (const p of products) m.set(p.category, [...(m.get(p.category) ?? []), p]);
    return [...m.entries()];
  }, [products]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => (fd.get(k) as string | null) ?? "";
    const base = { name: get("name"), email: get("email"), phone: get("phone"), company: get("company") };
    const inquiry =
      form === "contact" ? { form, ...base, message: get("message") }
      : form === "quote" ? { form, ...base, service: get("service"), product: get("product"), quantity: get("quantity"), timeline: get("timeline"), message: get("message") }
      : form === "sample" ? { form, ...base, products: fd.getAll("products") as string[], street: get("street"), city: get("city"), state: get("state"), zip: get("zip"), notes: get("notes") }
      : form === "project" ? { form, ...base, productType: get("productType"), description: get("description"), quantity: get("quantity"), timeline: get("timeline"), budget: get("budget"), attachments: (fd.getAll("attachments") as File[]).filter((f) => f.size).map((f) => f.name) }
      : { form, email: get("email"), company: get("company"), product: prefill };

    const payload = {
      inquiry,
      source: { ...readSource(), submittedFrom: window.location.pathname },
      marketingConsent: fd.get("marketingConsent") === "on",
      website: get("website"),
      elapsedMs: Date.now() - opened.current,
      ...(turnstileKey ? { turnstileToken: get("cf-turnstile-response") } : {}),
    };
    const parsed = InquiryEnvelope.safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const key = String(i.path.at(-1) ?? "form");
        errs[key] ??= i.message;
      }
      setErrors(errs);
      // Multi-step form: jump back to the first step that has an error.
      if (form === "project") setStep(errs.productType || errs.description ? 0 : errs.quantity || errs.timeline || errs.budget ? 1 : 2);
      return;
    }
    setErrors({});
    setStatus("sending");
    try {
      if (preview) {
        setStatus("idle");
        setErrors({ form: "Preview: the form is valid. Submissions are only sent from the live site." });
        return;
      }
      if (!demo) {
        const res = await fetch("/api/inquiry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
        if (res.status === 429) { setStatus("idle"); setErrors({ form: "Too many requests from your network. Please wait a few minutes or email us." }); return; }
        if (!res.ok) throw new Error(String(res.status));
      }
      // GA4 / Google Ads conversion hook (fires only if the site owner installed gtag).
      (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "generate_lead", { form_type: form });
      router.push("/thank-you");
    } catch {
      setStatus("error");
    }
  }

  const contactFields = (companyRequired: boolean) => (
    <div className="form-grid">
      <Field label="Full name" name="name" required autoComplete="name" error={errors.name} />
      <Field label="Company" name="company" required={companyRequired} autoComplete="organization" error={errors.company} />
      <Field label="Work email" name="email" type="email" required autoComplete="email" error={errors.email} />
      <Field label="Phone" name="phone" type="tel" autoComplete="tel" error={errors.phone} />
    </div>
  );

  const consent = (
    <div className="field check">
      <input id="f-consent" type="checkbox" name="marketingConsent" />
      <label htmlFor="f-consent">Send me occasional product news by email. I can unsubscribe anytime.</label>
    </div>
  );

  return (
    <form className="inquiry-form" onSubmit={onSubmit} noValidate>
      {/* Honeypot: hidden from people and screen readers, filled only by bots. */}
      <div className="hp" aria-hidden="true">
        <label htmlFor="f-website">Website</label>
        <input id="f-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {form === "contact" && (
        <>
          {contactFields(false)}
          <TextArea label="How can we help?" name="message" required error={errors.message} />
        </>
      )}

      {form === "quote" && (
        <>
          {contactFields(true)}
          <div className="form-grid">
            <Select label="Service" name="service" required options={["Private Label", "Custom Formulation", "Bulk & Wholesale", "Not sure yet"]} error={errors.service} />
            <Field label="Product(s) of interest" name="product" defaultValue={prefillName} key={prefillName} />
            <Select label="Estimated quantity" name="quantity" required options={QUANTITIES} error={errors.quantity} />
            <Select label="Timeline" name="timeline" required options={TIMELINES} error={errors.timeline} />
          </div>
          <TextArea label="Anything else we should know?" name="message" error={errors.message} />
        </>
      )}

      {form === "sample" && (
        <>
          {contactFields(false)}
          <fieldset className="field">
            <legend>Formulas to sample (up to 5) <span aria-hidden="true">*</span></legend>
            <div className="sample-pick">
              {byCategory.map(([cat, list]) => (
                <div key={cat}>
                  <p className="small strong">{cat}</p>
                  {list.map((p) => (
                    <label key={p.slug} className="check">
                      <input type="checkbox" name="products" value={p.name} defaultChecked={p.slug === prefill} key={`${p.slug}-${prefill}`} /> {p.name}
                    </label>
                  ))}
                </div>
              ))}
            </div>
            {errors.products && <p className="field-error" role="alert">{errors.products}</p>}
          </fieldset>
          <div className="form-grid">
            <Field label="Street address" name="street" required autoComplete="street-address" error={errors.street} />
            <Field label="City" name="city" required autoComplete="address-level2" error={errors.city} />
            <Field label="State" name="state" required autoComplete="address-level1" maxLength={2} hint="2-letter code, e.g. SC" error={errors.state} />
            <Field label="ZIP code" name="zip" required autoComplete="postal-code" error={errors.zip} />
          </div>
          <TextArea label="Notes" name="notes" rows={3} error={errors.notes} />
        </>
      )}

      {form === "project" && (
        <>
          <ol className="stepper" aria-label="Form progress">
            {["Your product", "Scale", "Contact"].map((s, i) => (
              <li key={s} aria-current={i === step ? "step" : undefined} className={i === step ? "on" : ""}>{i + 1}. {s}</li>
            ))}
          </ol>
          <div hidden={step !== 0} className="form-step">
            <Select label="Product type" name="productType" required options={PRODUCT_TYPES} error={errors.productType} />
            <TextArea label="Describe the product you want to create" name="description" required error={errors.description} rows={5} />
          </div>
          <div hidden={step !== 1} className="form-step form-grid">
            <Select label="First-order quantity" name="quantity" required options={QUANTITIES} error={errors.quantity} />
            <Select label="Target launch" name="timeline" required options={TIMELINES} error={errors.timeline} />
            <Select label="Development budget" name="budget" required options={BUDGETS} error={errors.budget} />
          </div>
          <div hidden={step !== 2} className="form-step">
            {contactFields(true)}
            <div className="field">
              <label htmlFor="f-attachments">Reference files <span className="muted small">(optional: briefs, benchmark products, packaging)</span></label>
              <input id="f-attachments" name="attachments" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" />
            </div>
          </div>
          <div className="actions step-nav">
            {step > 0 && <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)}>Back</button>}
            {step < 2 && <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>Next</button>}
          </div>
        </>
      )}

      {form === "spec_sheet" && (
        <div className="form-grid">
          <Field label="Work email" name="email" type="email" required autoComplete="email" error={errors.email} />
          <Field label="Company" name="company" autoComplete="organization" error={errors.company} />
        </div>
      )}

      {(form !== "project" || step === 2) && (
        <>
          {consent}
          {turnstileKey && <div className="cf-turnstile" data-sitekey={turnstileKey} />}
          {errors.form && <p className="field-error" role="alert">{errors.form}</p>}
          <p className="muted small">
            We use your details only to answer this request. See our <a href="/privacy">privacy policy</a>.
          </p>
          <button type="submit" className="btn btn-primary" disabled={status === "sending"}>
            {status === "sending" ? "Sending…" : submitLabel}
          </button>
          {status === "error" && <p className="field-error" role="alert">Something went wrong. Please email us or call instead.</p>}
          {demo && <p className="muted small">Demo site: submissions are validated but not sent.</p>}
        </>
      )}
    </form>
  );
}
