import { z } from "zod";
import { BLOCKS, type BlockType } from "@/schema/blocks";
import { CollectionSchema, CompanySchema, PageSchema, ProductSchema, SeoSchema, ServiceSchema } from "@/schema/site";
import { ThemeSchema } from "@/schema/theme";

/** JSON Schemas for the admin forms, derived from the zod schemas (one source of truth). */
// Round-trip through JSON so the result is a plain object that can be sent to client components.
const toJson = (s: z.ZodType) => JSON.parse(JSON.stringify(z.toJSONSchema(s, { unrepresentable: "any", io: "input" }))) as Record<string, unknown>;
const cache = new Map<string, Record<string, unknown>>();
const memo = (k: string, s: () => z.ZodType) => {
  if (!cache.has(k)) cache.set(k, toJson(s()));
  return cache.get(k)!;
};

export const blockJsonSchema = (t: BlockType) => memo(`block:${t}`, () => BLOCKS[t]);
export const themeJsonSchema = () => memo("theme", () => ThemeSchema);
export const companyJsonSchema = () => memo("company", () => CompanySchema);
export const servicesJsonSchema = () => memo("services", () => z.object({ services: ServiceSchema.array().min(1).max(5) }));
export const productJsonSchema = () => memo("product", () => ProductSchema);
export const collectionJsonSchema = () => memo("collection", () => CollectionSchema);
export const pageSettingsJsonSchema = () =>
  memo("page", () => PageSchema.pick({ name: true, slug: true, template: true }).extend({ seo: SeoSchema }));
