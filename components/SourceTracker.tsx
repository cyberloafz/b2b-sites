"use client";

import { useEffect } from "react";

const KEY = "lead_source_v1";
const PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "fbclid", "msclkid"];

/**
 * Remembers where the visitor came from (ad click IDs, UTM tags, referrer, landing page) for the
 * browser session, so the inquiry they send later carries it. A new ad/campaign click replaces it.
 * This is how a company learns which ads actually produce quote requests.
 */
export function SourceTracker() {
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const tagged = PARAMS.some((p) => q.get(p));
      // Keep the first touch of the session, unless the visitor arrives again from a campaign/ad click.
      if (sessionStorage.getItem(KEY) && !tagged) return;
      const data: Record<string, string> = { landingPage: window.location.pathname };
      if (document.referrer && !document.referrer.startsWith(window.location.origin)) data.referrer = document.referrer;
      for (const p of PARAMS) {
        const v = q.get(p);
        if (v) data[p] = v.slice(0, 300);
      }
      sessionStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable: inquiries are still sent, just without source data */
    }
  }, []);
  return null;
}

export function readSource(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}
