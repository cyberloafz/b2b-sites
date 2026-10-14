import Link from "next/link";
import type { ReactNode } from "react";
import type { z } from "zod";
import type { ImageSchema, LinkSchema } from "@/schema/blocks";
import type { Collection, Product, Site } from "@/schema/site";
import { srcSetFor } from "@/lib/image-variants";

export type BlockCtx = {
  site: Site;
  /** True for exactly one block per page: that block renders the page's H1. */
  primary: boolean;
  /** Set on generated category / product pages. */
  collection?: Collection;
  product?: Product;
  /** Position on the page; the first image-bearing block loads eagerly (LCP). */
  index: number;
};

/** Block title: H1 for the page's primary block, otherwise H2. Blocks never pick their own level. */
export function Heading({ primary, children, className }: { primary: boolean; children: ReactNode; className?: string }) {
  return primary ? <h1 className={className}>{children}</h1> : <h2 className={className}>{children}</h2>;
}

/** Level for headings nested inside a block (cards, steps, FAQ groups). */
export const subLevel = (primary: boolean) => (primary ? 2 : 3) as 2 | 3;

export function Sub({ primary, children, className }: { primary: boolean; children: ReactNode; className?: string }) {
  return primary ? <h2 className={className}>{children}</h2> : <h3 className={className}>{children}</h3>;
}

type L = z.infer<typeof LinkSchema>;
export function Btn({ link, variant = "primary" }: { link: L; variant?: "primary" | "secondary" | "ghost" }) {
  const cls = `btn btn-${variant}`;
  if (/^(https?:|mailto:|tel:)/.test(link.href)) return <a className={cls} href={link.href}>{link.label}</a>;
  return <Link className={cls} href={link.href}>{link.label}</Link>;
}

type I = z.infer<typeof ImageSchema>;
export function Img({ image, eager, className, sizes }: { image: I; eager?: boolean; className?: string; sizes?: string }) {
  const srcSet = srcSetFor(image.src, image.width);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={image.src}
      srcSet={srcSet}
      sizes={srcSet ? sizes ?? "(max-width: 860px) 100vw, 50vw" : undefined}
      alt={image.alt}
      width={image.width}
      height={image.height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      {...(eager ? { fetchPriority: "high" as const } : {})}
    />
  );
}

export const productPath = (p: Product) => `/products/${p.collection}/${p.slug}`;
export const collectionPath = (c: Collection) => `/products/${c.slug}`;
