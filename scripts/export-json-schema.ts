import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { BLOCKS } from "../schema/blocks";
import { SiteSchema } from "../schema/site";
import { ThemeSchema } from "../schema/theme";

/**
 * Exports JSON Schema files. These are what the AI generation step passes to the
 * model as "structured output" constraints, one block type at a time.
 */
const out = "schema/json";
mkdirSync(`${out}/blocks`, { recursive: true });
const write = (path: string, schema: z.ZodType) =>
  writeFileSync(path, JSON.stringify(z.toJSONSchema(schema, { unrepresentable: "any", io: "input" }), null, 2) + "\n");

for (const [name, schema] of Object.entries(BLOCKS)) write(`${out}/blocks/${name}.json`, schema);
write(`${out}/theme.json`, ThemeSchema);
write(`${out}/site.json`, SiteSchema);
console.log(`Wrote ${Object.keys(BLOCKS).length} block schemas + theme + site to ${out}/`);
