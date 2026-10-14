"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPageAction } from "../actions";

export function NewPageForm({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const auto = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createPageAction(siteId, name, touched ? slug : auto);
          if (r.ok) router.push(`/admin/${siteId}/pages/${r.value}`);
          else setError(r.errors[0]?.message ?? "Could not create the page");
        });
      }}
    >
      <div className="fld">
        <label htmlFor="np-name">Page name</label>
        <input id="np-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Quality & Certifications" required />
      </div>
      <div className="fld">
        <label htmlFor="np-slug">Address</label>
        <input id="np-slug" value={touched ? slug : `/${auto}`} onChange={(e) => { setTouched(true); setSlug(e.target.value); }} />
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="primary" disabled={pending || !name.trim()}>{pending ? "Creating…" : "Create page"}</button>
    </form>
  );
}
