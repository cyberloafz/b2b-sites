import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import { put as blobPut } from "@vercel/blob";

/**
 * File storage for uploads. Three drivers, chosen by STORAGE_DRIVER:
 *   local (default)  files in STORAGE_DIR (default .data/uploads), served by /media/<site>/<file>
 *   s3               any S3-compatible bucket — Cloudflare R2 in production. Files are served straight
 *                    from STORAGE_PUBLIC_URL (the bucket's public/CDN address), so they never touch the app server.
 *   blob             Vercel Blob (public store). Chosen automatically when BLOB_READ_WRITE_TOKEN is set,
 *                    which Vercel does when a Blob store is connected to the project. Simplest on Vercel.
 * The rest of the app only stores the URL that put() returns.
 *
 * R2 settings: S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com  S3_REGION=auto  S3_BUCKET=<bucket>
 *              S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY from an R2 API token with Object Read & Write,
 *              STORAGE_PUBLIC_URL=https://media.yourplatform.com (a custom domain connected to the bucket).
 */
const ROOT = process.env.STORAGE_DIR ?? path.join(process.cwd(), ".data", "uploads");
const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "");

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const TYPE_BY_EXT = Object.fromEntries(Object.entries(ALLOWED_IMAGE_TYPES).map(([mime, ext]) => [ext, mime]));

export const storageDriver = (): "local" | "s3" | "blob" => {
  const d = process.env.STORAGE_DRIVER;
  if (d === "s3" || d === "blob" || d === "local") return d;
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
};

let client: AwsClient | null = null;
function s3() {
  const need = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "STORAGE_PUBLIC_URL"].filter((k) => !process.env[k]);
  if (need.length) throw new Error(`STORAGE_DRIVER=s3 needs ${need.join(", ")}`);
  client ??= new AwsClient({ accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!, service: "s3", region: process.env.S3_REGION ?? "auto" });
  return { client, url: (key: string) => `${process.env.S3_ENDPOINT!.replace(/\/+$/, "")}/${process.env.S3_BUCKET}/${key}` };
}

/** Stores a file and returns the URL to put in pages. */
export async function put(siteId: string, file: string, bytes: Buffer) {
  const key = `${safe(siteId)}/${safe(file)}`;
  const type = TYPE_BY_EXT[file.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
  if (storageDriver() === "blob") {
    // Names are random ids, so they never collide and can be cached forever.
    const r = await blobPut(key, bytes, { access: "public", contentType: type, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000 });
    return r.url;
  }
  if (storageDriver() === "s3") {
    const { client, url } = s3();
    const res = await client.fetch(url(key), {
      method: "PUT",
      body: new Uint8Array(bytes),
      headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" },
    });
    if (!res.ok) throw new Error(`Upload to storage failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return `${process.env.STORAGE_PUBLIC_URL!.replace(/\/+$/, "")}/${key}`;
  }
  const dir = path.join(ROOT, safe(siteId));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, safe(file)), bytes);
  return `/media/${key}`;
}

/** Reads a stored file (used by /media/… for files uploaded before a switch to the s3 driver). */
export async function get(siteId: string, file: string): Promise<Buffer> {
  if (storageDriver() === "blob") throw new Error("Not found"); // Blob files are always served from their own URL
  if (storageDriver() === "s3") {
    const { client, url } = s3();
    const res = await client.fetch(url(`${safe(siteId)}/${safe(file)}`));
    if (!res.ok) throw new Error(`Not found (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(path.join(ROOT, safe(siteId), safe(file)));
}
