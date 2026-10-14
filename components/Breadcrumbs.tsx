import Link from "next/link";
import type { Site } from "@/schema/site";
import { breadcrumbLd, type Crumb } from "@/lib/seo";
import { JsonLd } from "./JsonLd";

/** Visible breadcrumb trail + BreadcrumbList structured data, on every page except home. */
export function Breadcrumbs({ site, crumbs }: { site: Site; crumbs: Crumb[] }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumbs container">
        <ol>
          {crumbs.map((c, i) => (
            <li key={c.path}>
              {i < crumbs.length - 1 ? <Link href={c.path}>{c.name}</Link> : <span aria-current="page">{c.name}</span>}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd data={breadcrumbLd(site, crumbs)} />
    </>
  );
}
