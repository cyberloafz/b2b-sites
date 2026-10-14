/**
 * Vercel Blob storage driver against the local mock (tests/mock-cloud.mjs on :4557):
 *   npx tsx tests/check-blob-storage.mts
 */
process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teststore_secret123";
process.env.VERCEL_BLOB_API_URL = "http://127.0.0.1:4557/blob";
delete process.env.STORAGE_DRIVER;

async function main() {
  const { put, storageDriver } = await import("../lib/storage");
  const { srcSetFor } = await import("../lib/image-variants");
  const results: [string, boolean][] = [];
  results.push(["blob driver chosen automatically when Vercel connects a Blob store", storageDriver() === "blob"]);
  const url = await put("demo", "0123456789abcdef.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  results.push(["upload returns the public blob URL", url === "http://127.0.0.1:4557/blobstore/demo/0123456789abcdef.png"]);
  const res = await fetch(url);
  results.push(["file is served from the blob URL", res.ok && (await res.arrayBuffer()).byteLength === 4 && res.headers.get("content-type") === "image/png"]);
  results.push(["responsive srcset works with blob URLs", (srcSetFor(url, 1200) ?? "").includes("http://127.0.0.1:4557/blobstore/demo/0123456789abcdef-480.webp 480w")]);
  for (const [n, ok] of results) console.log((ok ? "PASS " : "FAIL ") + n);
  process.exit(results.every(([, ok]) => ok) ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
