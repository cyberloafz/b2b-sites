import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedSite, siteIdFromHostParam } from "@/lib/site-runtime";
import { SiteShell } from "@/components/SiteShell";
import "@/styles/site.css";

type Props = { children: ReactNode; params: Promise<{ host: string }> };

async function load(params: Props["params"]) {
  const siteId = await siteIdFromHostParam((await params).host);
  return siteId ? getPublishedSite(siteId) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const live = await load(params);
  if (!live) return {};
  return {
    metadataBase: new URL(live.site.company.siteUrl),
    title: { default: live.site.company.brandName, template: "%s" },
    icons: { icon: live.site.globals.header.logo.src },
  };
}

export default async function SiteLayout({ children, params }: Props) {
  const live = await load(params);
  if (!live) notFound();
  return <SiteShell site={live.site}>{children}</SiteShell>;
}
