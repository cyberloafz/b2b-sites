import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Loads a runtime prompt from ai-prompts/<name>.md and fills its {{placeholders}}.
 * Everything after the first `---` line is the prompt: `**System**` … `**User**` ….
 * Prompts live in plain Markdown so they can be reviewed and edited without touching code.
 */
const DIR = process.env.AI_PROMPTS_DIR ?? path.join(process.cwd(), "ai-prompts");
const cache = new Map<string, { system: string; user: string }>();

function parse(name: string) {
  const hit = cache.get(name);
  if (hit && process.env.NODE_ENV === "production") return hit;
  const raw = readFileSync(path.join(DIR, `${name}.md`), "utf8");
  const body = raw.split(/^---\s*$/m).slice(1).join("---");
  const m = body.match(/\*\*System\*\*\s*([\s\S]*?)\*\*User\*\*\s*([\s\S]*)$/);
  if (!m) throw new Error(`Prompt ${name}.md needs **System** and **User** sections after a --- line`);
  const parsed = { system: m[1].trim(), user: m[2].trim() };
  cache.set(name, parsed);
  return parsed;
}

export function loadPrompt(name: string, vars: Record<string, unknown>) {
  const { system, user } = parse(name);
  const fill = (t: string) =>
    t.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
      if (!(k in vars)) throw new Error(`Prompt ${name}.md uses {{${k}}} but no value was given`);
      const v = vars[k];
      return typeof v === "string" ? v : JSON.stringify(v);
    });
  return { system: fill(system), user: fill(user) };
}
