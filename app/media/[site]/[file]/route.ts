import { get, ALLOWED_IMAGE_TYPES } from "@/lib/storage";

const TYPE_BY_EXT = Object.fromEntries(Object.entries(ALLOWED_IMAGE_TYPES).map(([mime, ext]) => [ext, mime]));

/** Serves uploaded images. File names are random ids, so responses can be cached forever. */
export async function GET(_req: Request, { params }: { params: Promise<{ site: string; file: string }> }) {
  const { site, file } = await params;
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const type = TYPE_BY_EXT[ext];
  if (!type) return new Response("Not found", { status: 404 });
  try {
    const bytes = await get(site, file);
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
