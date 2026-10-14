import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { one, q } from "@/db/client";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, put } from "@/lib/storage";
import { variantPlan } from "@/lib/image-variants";

export type MediaRow = { id: string; url: string; filename: string; mime: string; bytes: number; width: number | null; height: number | null; alt: string; variants: { w: number; url: string; bytes: number }[]; created_at: string };

export async function listMedia(siteId: string) {
  return q<MediaRow>("SELECT * FROM media WHERE site_id = $1 ORDER BY created_at DESC LIMIT 500", [siteId]);
}

/** Validates type and size, records dimensions (needed for width/height on <img>, which prevents layout shift). */
export async function uploadMedia(siteId: string, file: File, alt: string): Promise<{ ok: true; media: MediaRow } | { ok: false; error: string }> {
  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) return { ok: false, error: "Use a JPG, PNG, WebP or AVIF image." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: `Images can be up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` };
  const input = Buffer.from(await file.arrayBuffer());
  // Normalise once: apply camera rotation and drop metadata (EXIF can contain GPS location).
  let bytes: Buffer, width: number, height: number;
  try {
    const img = sharp(input, { failOn: "error" }).rotate();
    bytes = await img.toBuffer();
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height) throw new Error("no size");
    width = meta.width;
    height = meta.height;
  } catch {
    return { ok: false, error: "This file does not look like a valid image." };
  }
  if (width < 200 || height < 150) return { ok: false, error: "Images must be at least 200 × 150 pixels." };
  const id = randomBytes(8).toString("hex");
  const url = await put(siteId, `${id}.${ext}`, bytes);
  // Responsive WebP copies; the renderer builds srcset from the same naming plan.
  const variants = [];
  for (const v of variantPlan(width)) {
    const out = await sharp(bytes).resize({ width: v.w, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    variants.push({ w: v.w, url: await put(siteId, `${id}-${v.suffix}.webp`, out), bytes: out.length });
  }
  const row = await one<MediaRow>(
    "INSERT INTO media (id, site_id, url, filename, mime, bytes, width, height, alt, variants) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
    [id, siteId, url, file.name.slice(0, 200), file.type, bytes.length, width, height, alt.slice(0, 125), JSON.stringify(variants)]
  );
  return { ok: true, media: row! };
}

export async function setMediaAlt(siteId: string, id: string, alt: string) {
  await q("UPDATE media SET alt = $1 WHERE site_id = $2 AND id = $3", [alt.slice(0, 125), siteId, id]);
}
