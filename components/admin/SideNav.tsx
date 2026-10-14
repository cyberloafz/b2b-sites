"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SideNav({ siteId, role, newInquiries }: { siteId: string; role: "owner" | "editor"; newInquiries: number }) {
  const path = usePathname();
  const base = `/admin/${siteId}`;
  const items: [string, string, boolean?][] = [
    ["Dashboard", ""],
    ["Pages", "/pages"],
    ["Header & footer", "/site"],
    ["Products", "/products"],
    ["Categories", "/categories"],
    ["Images", "/media"],
    [`Inquiries${newInquiries ? ` (${newInquiries} new)` : ""}`, "/inquiries"],
    ["Publish & history", "/publish"],
    ["Redirects & 404s", "/redirects"],
    ["Domains", "/domains", true],
    ["Team", "/team", true],
    ["Theme", "/theme", true],
    ["Company & settings", "/company", true],
  ];
  return (
    <nav aria-label="Admin">
      {items.filter(([, , ownerOnly]) => !ownerOnly || role === "owner").map(([label, href]) => {
        const full = base + href;
        const active = href === "" ? path === base : path.startsWith(full);
        return <Link key={href} href={full} aria-current={active ? "page" : undefined}>{label}</Link>;
      })}
    </nav>
  );
}
