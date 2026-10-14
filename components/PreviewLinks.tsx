"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * In the editor preview, site links ("/about") must stay inside the preview ("/preview/demo/about").
 * Clicks are intercepted once at the document level, so no block component needs to know about previews.
 */
export function PreviewLinks({ base }: { base: string }) {
  const router = useRouter();
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      const href = a?.getAttribute("href");
      if (!a || !href || !href.startsWith("/") || href.startsWith(base) || href.startsWith("//")) return;
      if (/^\/(media|images)\//.test(href)) return;
      e.preventDefault();
      e.stopPropagation();
      router.push(base + (href === "/" ? "" : href));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [base, router]);
  return null;
}
