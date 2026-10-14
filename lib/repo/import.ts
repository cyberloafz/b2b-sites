import Papa from "papaparse";
import { readSheet } from "read-excel-file/node";
import { ProductSchema, type Product } from "@/schema/site";
import { listCollections, getProduct, saveProduct } from "./editor";

/**
 * Spreadsheet import for products: parse → the user maps columns → validate each row → upsert by slug.
 * Values come only from the sheet; anything required but missing becomes a [[TODO: …]] placeholder
 * that blocks publishing until someone fills it in.
 */

export const IMPORT_FIELDS = [
  { key: "name", label: "Product name", required: true, guess: ["name", "product", "product name", "title", "item"] },
  { key: "category", label: "Category", required: true, guess: ["category", "collection", "type", "product type", "group"] },
  { key: "description", label: "Description", required: true, guess: ["description", "details", "long description", "body"] },
  { key: "summary", label: "Short summary", required: false, guess: ["summary", "short description", "tagline", "subtitle"] },
  { key: "sku", label: "SKU", required: false, guess: ["sku", "item number", "code", "part number"] },
  { key: "slug", label: "URL slug", required: false, guess: ["slug", "handle", "url"] },
  { key: "highlights", label: "Highlights (separate with ;)", required: false, guess: ["highlights", "features", "benefits", "key features"] },
  { key: "specs", label: "Specs (Label: value; …)", required: false, guess: ["specs", "specifications", "attributes"] },
  { key: "packaging", label: "Sizes / packaging (separate with ;)", required: false, guess: ["packaging", "sizes", "size", "variants", "pack sizes"] },
  { key: "usage", label: "How to use", required: false, guess: ["usage", "how to use", "directions", "instructions"] },
  { key: "composition", label: "Ingredients / materials", required: false, guess: ["ingredients", "inci", "materials", "composition"] },
  { key: "image", label: "Image URL", required: false, guess: ["image", "image url", "photo", "picture", "image src"] },
  { key: "imageAlt", label: "Image alt text", required: false, guess: ["image alt", "alt", "alt text"] },
  { key: "specSheetUrl", label: "Spec sheet URL", required: false, guess: ["spec sheet", "datasheet", "tds", "pdf"] },
  { key: "featured", label: "Featured (yes/no)", required: false, guess: ["featured", "best seller", "bestseller"] },
] as const;
export type ImportKey = (typeof IMPORT_FIELDS)[number]["key"];
export type Mapping = Partial<Record<ImportKey, number>>; // field → column index

export async function parseSheet(file: File): Promise<{ ok: true; headers: string[]; rows: string[][] } | { ok: false; error: string }> {
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "Spreadsheets can be up to 5 MB." };
  const name = file.name.toLowerCase();
  let table: string[][];
  try {
    if (name.endsWith(".csv") || file.type === "text/csv") {
      const res = Papa.parse<string[]>(await file.text(), { skipEmptyLines: "greedy" });
      table = res.data;
    } else if (name.endsWith(".xlsx")) {
      const rows = (await readSheet(Buffer.from(await file.arrayBuffer()))) as unknown[][]; // first worksheet
      table = rows.map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))));
    } else {
      return { ok: false, error: "Upload a .csv or .xlsx file. (Old .xls files: open in Excel and save as .xlsx.)" };
    }
  } catch {
    return { ok: false, error: "This file could not be read. Check that it is a valid CSV or Excel file." };
  }
  const [headers = [], ...rows] = table.filter((r) => r.some((c) => String(c).trim()));
  if (!headers.length || !rows.length) return { ok: false, error: "The sheet needs a header row and at least one product row." };
  if (rows.length > 2000) return { ok: false, error: "Import up to 2,000 products at a time." };
  return { ok: true, headers: headers.map((h) => String(h).trim()), rows: rows.map((r) => headers.map((_, i) => String(r[i] ?? "").trim())) };
}

export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const norm = headers.map((h) => h.toLowerCase().replace(/[_-]+/g, " ").trim());
  for (const f of IMPORT_FIELDS) {
    const i = norm.findIndex((h) => (f.guess as readonly string[]).includes(h));
    if (i >= 0 && !Object.values(m).includes(i)) m[f.key] = i;
  }
  return m;
}

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 80);
const split = (s: string) => s.split(/\s*[;\n|]\s*/).map((x) => x.trim()).filter(Boolean);
const firstSentence = (s: string) => {
  const m = s.match(/^.{20,160}?[.!?](\s|$)/);
  return (m ? m[0] : s.slice(0, 157).replace(/\s+\S*$/, "") + "…").trim();
};
const TODO = (w: string) => `[[TODO: ${w}]]`;

export type RowResult = { row: number; name: string; status: "created" | "updated" | "failed"; message?: string };

export async function importProducts(siteId: string, headers: string[], rows: string[][], mapping: Mapping): Promise<{ results: RowResult[] }> {
  const cols = await listCollections(siteId);
  const findCol = (v: string) => {
    const k = v.trim().toLowerCase();
    return cols.find((c) => c.slug === k || c.data.name.toLowerCase() === k || c.data.shortName.toLowerCase() === k || c.slug === slugify(v));
  };
  const results: RowResult[] = [];
  for (const [i, r] of rows.entries()) {
    const get = (k: ImportKey) => (mapping[k] === undefined ? "" : r[mapping[k]!] ?? "").trim();
    const name = get("name");
    const rowNo = i + 2; // spreadsheet row number (header is row 1)
    if (!name) { results.push({ row: rowNo, name: "(no name)", status: "failed", message: "Product name is empty" }); continue; }
    const col = findCol(get("category"));
    if (!col) { results.push({ row: rowNo, name, status: "failed", message: `Unknown category "${get("category")}". Create it under Categories first.` }); continue; }
    const description = get("description");
    if (description.length < 80) { results.push({ row: rowNo, name, status: "failed", message: "Description must be at least 80 characters" }); continue; }

    const slug = slugify(get("slug") || name);
    const existing = (await getProduct(siteId, slug))?.data;
    const highlights = split(get("highlights")).map((h) => h.slice(0, 80));
    const specs = split(get("specs")).map((s) => {
      const [label, ...rest] = s.split(":");
      return rest.length ? { label: label.trim().slice(0, 30), value: rest.join(":").trim().slice(0, 80) } : null;
    }).filter(Boolean) as Product["specs"];
    const packaging = split(get("packaging")).map((label) => ({ label: label.slice(0, 30) }));
    const imageUrl = get("image");

    const draft: Record<string, unknown> = {
      ...(existing ?? {}),
      slug,
      name: name.slice(0, 70),
      collection: col.slug,
      summary: (get("summary") || existing?.summary || firstSentence(description)).slice(0, 160),
      description,
      highlights: highlights.length >= 2 ? highlights.slice(0, 6) : existing?.highlights ?? [...highlights, TODO("highlight"), TODO("highlight")].slice(0, Math.max(2, highlights.length)),
      specs: specs.length ? specs.slice(0, 12) : existing?.specs ?? [],
      packaging: packaging.length ? packaging.slice(0, 8) : existing?.packaging ?? [{ label: TODO("size") }],
      image: imageUrl
        ? { src: imageUrl, alt: (get("imageAlt") || `${name} product photo`).slice(0, 125) }
        : existing?.image ?? { src: "/images/placeholder-product.svg", alt: `${name}: photo coming soon`.slice(0, 125), width: 800, height: 800 },
      seo: existing?.seo ?? { noindex: false },
    };
    if (get("sku")) draft.sku = get("sku").slice(0, 24);
    if (get("usage")) draft.usage = get("usage").slice(0, 600);
    if (get("composition")) draft.composition = { label: "Ingredients", text: get("composition").slice(0, 1500) };
    if (get("specSheetUrl")) draft.specSheetUrl = get("specSheetUrl");
    if (get("featured")) draft.featured = /^(y|yes|true|1|x)$/i.test(get("featured"));

    const parsed = ProductSchema.safeParse(draft);
    if (!parsed.success) {
      const e = parsed.error.issues[0];
      results.push({ row: rowNo, name, status: "failed", message: `${e.path.join(".")}: ${e.message}` });
      continue;
    }
    const saved = await saveProduct(siteId, existing ? slug : null, parsed.data);
    if (!saved.ok) results.push({ row: rowNo, name, status: "failed", message: saved.errors[0].message });
    else results.push({ row: rowNo, name, status: existing ? "updated" : "created" });
  }
  void headers;
  return { results };
}
