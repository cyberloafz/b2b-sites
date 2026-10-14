"use client";

import { useTransition } from "react";
import { setInquiryStatusAction } from "@/app/admin/[site]/actions";

const OPTIONS: [string, string][] = [["new", "New"], ["following_up", "Following up"], ["quoted", "Quoted"], ["won", "Won"], ["invalid", "Invalid"]];

export function StatusSelect({ siteId, id, value }: { siteId: string; id: number; value: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Inquiry status"
      defaultValue={value}
      disabled={pending}
      onChange={(e) => { const v = e.target.value; start(() => setInquiryStatusAction(siteId, id, v)); }}
      style={{ width: "auto" }}
    >
      {OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}
