import { requireSite } from "@/lib/auth/session";
import { listMedia } from "@/lib/repo/media";
import { MediaLibrary } from "@/components/admin/MediaLibrary";

export const metadata = { title: "Images" };

export default async function MediaPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  await requireSite(siteId);
  const media = await listMedia(siteId);
  return (
    <main className="a-page">
      <h1>Images</h1>
      <p className="sub">JPG, PNG, WebP or AVIF up to 8 MB. Write alt text that says what the picture shows; it is read aloud to blind visitors and used by search engines.</p>
      <MediaLibrary siteId={siteId} items={media.map((m) => ({ id: m.id, url: m.url, alt: m.alt, width: m.width, height: m.height, filename: m.filename, bytes: m.bytes }))} />
    </main>
  );
}
