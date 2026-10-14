/**
 * Responsive image naming shared by the uploader and the renderer.
 * An upload "<base>/<site>/<id>.<ext>" (base = /media or the R2 public address) with width W also gets WebP copies:
 *   /media/<site>/<id>-480.webp, -960.webp, -1600.webp   (only widths smaller than W)
 *   /media/<site>/<id>-full.webp                          (W, capped at 2400)
 */
export const VARIANT_WIDTHS = [480, 960, 1600];
export const FULL_MAX = 2400;

// Local uploads live under /media/; with the s3 driver (R2) they live on the storage's public https address.
const MEDIA = /^(\/media\/|https?:\/\/[^/?#]+\/(?:[^?#]*\/)?)([a-zA-Z0-9_-]+)\/([a-f0-9]{16})\.(jpg|png|webp|avif|gif)$/;

export function variantPlan(width: number) {
  return [...VARIANT_WIDTHS.filter((w) => w < width).map((w) => ({ w, suffix: String(w) })), { w: Math.min(width, FULL_MAX), suffix: "full" }];
}

/** srcset for an uploaded image, or undefined for anything else (static files, external URLs). */
export function srcSetFor(src: string, width?: number): string | undefined {
  const m = src.match(MEDIA);
  if (!m || !width) return undefined;
  const [, prefix, site, id] = m;
  return variantPlan(width).map((v) => `${prefix}${site}/${id}-${v.suffix}.webp ${v.w}w`).join(", ");
}
