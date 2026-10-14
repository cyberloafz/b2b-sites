import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reads a site from JSON files (the format the AI generation step writes):
 *   site.base.json   company, theme, services, header/footer, templates
 *   pages.json       fixed pages and their block lists
 *   collections.json categories (one long-tail page each)
 *   products.json    products (one page each)
 * Used by `npm run db:import` and `npm run validate`. The running platform reads the database.
 */
export function loadRawSite(dir = path.join(process.cwd(), "data")): unknown {
  const read = (f: string) => JSON.parse(readFileSync(path.join(dir, f), "utf8"));
  return {
    ...read("site.base.json"),
    pages: read("pages.json"),
    collections: read("collections.json"),
    products: read("products.json"),
  };
}
