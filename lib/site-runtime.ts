import { unstable_cache, revalidateTag } from "next/cache";
import { one } from "@/db/client";
import { siteIdForHost } from "@/lib/repo/sites";
import { primaryHost } from "@/lib/domains";
import type { Site } from "@/schema/site";

/** Public-site data access. Published versions are immutable, so they can be cached safely. */

const hostToSite = unstable_cache(
  async (host: string) => (await siteIdForHost(host)) ?? process.env.DEFAULT_SITE ?? null,
  ["host-to-site"],
  { tags: ["domains"], revalidate: 60 }
);

/** The site's main custom domain (verified, with SSL), or null while it only has platform addresses. */
export const primaryHostFor = unstable_cache(async (siteId: string) => primaryHost(siteId), ["primary-host"], { tags: ["domains"], revalidate: 60 });

export async function siteIdFromHostParam(hostParam: string) {
  return hostToSite(decodeURIComponent(hostParam));
}

/**
 * The latest version id is looked up on every request (one indexed query); the snapshot itself is
 * cached under that id. A published version never changes, so the cache can never serve stale
 * content — even with several server instances or after a database restore.
 */
export async function getPublishedSite(siteId: string): Promise<{ site: Site; versionId: number } | null> {
  const latest = await one<{ id: number; stamp: string }>(
    // A suspended site (unpaid, abuse) is offline: visitors get "not found" until it is resumed.
    `SELECT v.id, extract(epoch FROM v.created_at)::text AS stamp FROM site_versions v JOIN sites s ON s.id = v.site_id
      WHERE v.site_id = $1 AND s.status <> 'suspended' ORDER BY v.id DESC LIMIT 1`, [siteId]);
  if (!latest) return null;
  const live = await unstable_cache(
    async () => {
      const v = await one<{ snapshot: { site: Site } }>("SELECT snapshot FROM site_versions WHERE id = $1", [latest.id]);
      return v ? { site: v.snapshot.site, versionId: latest.id } : null;
    },
    // id + creation time: unique even if a database is restored and ids are reused.
    ["published-site", siteId, String(latest.id), latest.stamp],
    { tags: [`site:${siteId}`] }
  )();
  // Canonical URLs, sitemap and structured data follow the current primary domain without a republish.
  const primary = live ? await primaryHostFor(siteId) : null;
  return live && primary ? { ...live, site: { ...live.site, company: { ...live.site.company, siteUrl: `https://${primary}` } } } : live;
}

export async function findRedirect(siteId: string, path: string) {
  const clean = path.replace(/\/+$/, "") || "/";
  return one<{ to_path: string; code: number }>("SELECT to_path, code FROM redirects WHERE site_id = $1 AND from_path = $2", [siteId, clean]);
}

/** Call after every publish, rollback or domain change. */
export function siteChanged(siteId: string) {
  revalidateTag(`site:${siteId}`);
  revalidateTag("domains");
}
