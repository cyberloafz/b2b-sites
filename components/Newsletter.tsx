"use client";

import { useState, type FormEvent } from "react";

/** Footer sign-up. Consent is a separate, unticked box (CAN-SPAM / good practice). */
export function Newsletter({ heading, consentText }: { heading: string; consentText: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    if (!/^\S+@\S+\.\S+$/.test(email) || fd.get("consent") !== "on") return setState("error");
    // Wire to the email provider here (e.g. a /api/newsletter route that adds a contact with consent timestamp).
    setState("done");
  }
  return (
    <form className="newsletter" onSubmit={onSubmit} noValidate>
      <p className="footer-title">{heading}</p>
      {state === "done" ? (
        <p className="small" role="status">Thanks — you are on the list.</p>
      ) : (
        <>
          <label htmlFor="nl-email" className="sr-only">Email address</label>
          <input id="nl-email" name="email" type="email" autoComplete="email" placeholder="you@company.com" />
          <label className="check small">
            <input type="checkbox" name="consent" /> {consentText}
          </label>
          <button className="btn btn-primary" type="submit">Subscribe</button>
          {state === "error" && <p className="field-error small" role="alert">Enter your email and tick the consent box.</p>}
        </>
      )}
    </form>
  );
}
