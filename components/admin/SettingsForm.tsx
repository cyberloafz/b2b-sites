"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSettingsAction } from "@/app/admin/[site]/actions";

export function SettingsForm({ siteId, value }: { siteId: string; value: { crmWebhookUrl?: string; allowAiCrawlers?: boolean; gscProperty?: string } }) {
  const [url, setUrl] = useState(value.crmWebhookUrl ?? "");
  const [ai, setAi] = useState(value.allowAiCrawlers !== false);
  const [gsc, setGsc] = useState(value.gscProperty ?? "");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveSettingsAction(siteId, { crmWebhookUrl: url, allowAiCrawlers: ai, gscProperty: gsc });
          setMsg(r.ok ? "Saved. Takes effect immediately." : r.errors[0].message);
          router.refresh();
        });
      }}
    >
      <div className="fld">
        <label htmlFor="crm">CRM webhook <span className="opt">optional</span></label>
        <input id="crm" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.example.com/inquiries" />
        <p className="hint">Each new inquiry is sent here as JSON (HubSpot, Salesforce, Zapier, Make…). Failed deliveries retry 3 times.</p>
      </div>
      <div className="fld">
        <label htmlFor="gsc">Google Search Console property <span className="opt">optional</span></label>
        <input id="gsc" value={gsc} onChange={(e) => setGsc(e.target.value)} placeholder="sc-domain:example.com" />
        <p className="hint">The sitemap is submitted after every publish. Add the platform’s service account as a user of this property in Search Console first.</p>
      </div>
      <div className="fld check">
        <input id="ai" type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />
        <label htmlFor="ai">Allow AI search crawlers (ChatGPT, Claude, Perplexity…) to read the site</label>
      </div>
      <div className="row">
        <button className="primary" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
        {msg && <span className="muted" role="status">{msg}</span>}
      </div>
    </form>
  );
}
