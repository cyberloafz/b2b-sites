"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function PlatformNav() {
  const path = usePathname();
  const items: [string, string][] = [["Overview", "/platform"], ["Sites", "/platform/sites"], ["Users", "/platform/users"], ["Audit log", "/platform/audit"]];
  return (
    <nav aria-label="Platform">
      {items.map(([label, href]) => {
        const active = href === "/platform" ? path === href : path.startsWith(href);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined}>{label}</Link>;
      })}
    </nav>
  );
}
