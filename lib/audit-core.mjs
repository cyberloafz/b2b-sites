// SEO / accessibility rules shared by the CLI crawler (scripts/seo-audit.mjs) and the admin
// publish check (lib/seo-check.ts). Pure functions over a parsed page (node-html-parser).
//
// Every finding has a level:
//   error   → blocks publishing (visitors or search engines would get a broken or inaccessible page)
//   warning → shown in the report, does not block (e.g. a title a few characters too long)
// and, when the problem sits inside a block, the block id, so the admin can open that block.

/** @typedef {{ level: "error" | "warning", message: string, block?: string }} Finding */

const blockOf = (el) => el?.closest?.('[id^="blk-"]')?.getAttribute("id")?.slice(4);

/** @param {string} path @param {import("node-html-parser").HTMLElement} doc */
export function auditPage(path, doc) {
  /** @type {Finding[]} */
  const findings = [];
  const err = (message, el) => findings.push({ level: "error", message, block: blockOf(el) });
  const warn = (message, el) => findings.push({ level: "warning", message, block: blockOf(el) });
  const robots = doc.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "";
  const noindex = robots.includes("noindex");
  const main = doc.querySelector("main") ?? doc;

  const h1 = doc.querySelectorAll("h1");
  if (h1.length === 0) err("The page has no main heading (H1)");
  if (h1.length > 1) for (const h of h1.slice(1)) err(`More than one main heading (H1): "${h.text.trim().slice(0, 50)}"`, h);
  let prev = 0;
  for (const h of doc.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
    const lvl = Number(h.tagName[1]);
    if (!h.text.trim()) err(`Empty heading <${h.tagName.toLowerCase()}>`, h);
    if (prev && lvl > prev + 1) err(`Heading skips a level (h${prev} → h${lvl}): "${h.text.trim().slice(0, 40)}"`, h);
    prev = lvl;
  }

  const imgs = doc.querySelectorAll("img");
  const imageSrcs = [...new Set(imgs.map((i) => i.getAttribute("src")).filter((s) => s && s.startsWith("/")))];
  for (const img of imgs) {
    const alt = img.getAttribute("alt");
    const src = img.getAttribute("src");
    if (alt === undefined || alt === null) err(`Image has no alt text (${src})`, img);
    else if (!alt.trim()) err(`Image has empty alt text (${src})`, img);
    if (!img.getAttribute("width") || !img.getAttribute("height")) warn(`Image has no width/height, the page may jump while loading (${src})`, img);
  }

  const title = doc.querySelector("title")?.text.trim() ?? "";
  if (!title) err("Missing page title");
  else if (title.length > 60) warn(`Title is ${title.length} characters; search results cut it after about 60: "${title}"`);
  const description = doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
  if (!noindex) {
    if (!description) warn("Missing meta description");
    else if (description.length < 70 || description.length > 160) warn(`Meta description is ${description.length} characters (aim for 70–160)`);
  }
  const canon = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
  if (!canon) err("Missing canonical URL");
  else if (new URL(canon).pathname !== path) err(`Canonical URL points to ${new URL(canon).pathname} instead of this page`);

  let jsonLd = 0;
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    jsonLd++;
    try {
      const j = JSON.parse(s.text);
      if (!j["@context"] || !j["@type"]) err("Structured data block without @context/@type", s);
      if (Array.isArray(j.sameAs) && j.sameAs.some((x) => !x)) err("Structured data lists an empty social profile", s);
    } catch {
      err("Structured data is not valid JSON", s);
    }
  }

  /** @type {{ href: string, block?: string }[]} */
  const links = [];
  for (const a of main.querySelectorAll("a[href]").concat(doc.querySelectorAll("header a[href], footer a[href]"))) {
    const href = a.getAttribute("href");
    if (!a.text.trim() && !a.getAttribute("aria-label") && !a.querySelector("img[alt]")) err(`Link without text (${href})`, a);
    if (href.startsWith("/") && !href.startsWith("//")) links.push({ href, block: blockOf(a) });
  }

  for (const i of doc.querySelectorAll("input,select,textarea")) {
    if (["hidden", "submit"].includes(i.getAttribute("type"))) continue;
    const id = i.getAttribute("id");
    const labelled = (id && doc.querySelector(`label[for="${id}"]`)) || i.closest("label") || i.getAttribute("aria-label");
    if (!labelled) err(`Form field "${i.getAttribute("name")}" has no label`, i);
  }

  const seen = new Set();
  const uniqueLinks = links.filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true)));
  return { path, findings, noindex, title, description, images: imgs.length, imageSrcs, jsonLd, links: uniqueLinks };
}

/** Cross-page checks: duplicate titles and descriptions, sitemap consistency (when a sitemap is given). */
export function auditSite(pages, sitemapXml) {
  /** @type {(Finding & { path?: string })[]} */
  const siteFindings = [];
  const titles = new Map(), descs = new Map();
  for (const p of pages) {
    if (!p.title) continue;
    if (!p.noindex) {
      titles.set(p.title, [...(titles.get(p.title) ?? []), p.path]);
      if (p.description) descs.set(p.description, [...(descs.get(p.description) ?? []), p.path]);
    }
    if (sitemapXml) {
      const inMap = new RegExp(`<loc>[^<]*${p.path === "/" ? "/" : p.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>`).test(sitemapXml);
      if (p.noindex && inMap) siteFindings.push({ level: "error", path: p.path, message: "Hidden page is listed in sitemap.xml" });
      if (!p.noindex && !inMap) siteFindings.push({ level: "error", path: p.path, message: "Page is missing from sitemap.xml" });
    }
  }
  for (const [t, urls] of titles) if (urls.length > 1) siteFindings.push({ level: "warning", path: urls[0], message: `Same title on ${urls.length} pages (${urls.join(", ")}): "${t}"` });
  for (const [, urls] of descs) if (urls.length > 1) siteFindings.push({ level: "warning", path: urls[0], message: `Same meta description on ${urls.length} pages (${urls.join(", ")})` });
  return {
    siteFindings,
    pages: pages.length,
    images: pages.reduce((n, p) => n + (p.images ?? 0), 0),
    links: pages.reduce((n, p) => n + (p.links?.length ?? 0), 0),
    jsonLd: pages.reduce((n, p) => n + (p.jsonLd ?? 0), 0),
  };
}

/**
 * Crawl from "/" through internal links. `fetchPath(path, { method })` returns { status, contentType, text() }.
 * Used by both the CLI (HTTP to a running site) and the admin (HTTP to the draft preview).
 */
export async function crawl(fetchPath, parse, { maxPages = 1000 } = {}) {
  const queue = ["/"], seen = new Set(queue), pages = [];
  const statusCache = new Map();
  const status = (p) => {
    if (!statusCache.has(p)) statusCache.set(p, fetchPath(p, { method: "HEAD" }).then((r) => r.status).catch(() => 0));
    return statusCache.get(p);
  };
  while (queue.length && pages.length < maxPages) {
    const path = queue.shift();
    const res = await fetchPath(path, { method: "GET" });
    if (res.status !== 200 || !(res.contentType ?? "").includes("text/html")) {
      pages.push({ path, findings: [{ level: "error", message: `Page does not load (HTTP ${res.status})` }], links: [], imageSrcs: [] });
      continue;
    }
    const page = auditPage(path, parse(await res.text()));
    for (const l of page.links) {
      const clean = l.href.split(/[?#]/)[0] || "/";
      const st = await status(clean);
      if (st >= 400 || st === 0) page.findings.push({ level: "error", message: `Broken link to ${l.href} (HTTP ${st})`, block: l.block });
      if (!seen.has(clean) && st === 200 && !/^\/(media|images|api)\//.test(clean)) {
        seen.add(clean);
        queue.push(clean);
      }
    }
    for (const src of page.imageSrcs) {
      const st = await status(src);
      if (st !== 200) page.findings.push({ level: "error", message: `Image does not load: ${src} (HTTP ${st})` });
    }
    pages.push(page);
  }
  return pages;
}
