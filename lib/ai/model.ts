import { AsyncLocalStorage } from "node:async_hooks";
import type { z } from "zod";
import { mockGenerate } from "./mock";

/**
 * Model access for site generation. One function: ask for JSON matching a schema.
 *
 *   AI_PROVIDER=anthropic (needs ANTHROPIC_API_KEY; model from AI_MODEL, default claude-sonnet-5-5)
 *     Uses the Messages API with structured outputs (`output_config.format` = json_schema).
 *     Structured outputs do not accept length/number limits, so those are moved into field
 *     descriptions for the model, and the full zod schema is enforced on the answer here.
 *   AI_PROVIDER=mock (default when no key is set)
 *     Deterministic stand-in used by tests and demos: schema-valid, fact-only, plain wording.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type JsonSchema = Record<string, any>;
export type GenerateRequest<T> = {
  task: string;                 // short label for logs, e.g. "block:hero"
  system: string;
  user: string;
  jsonSchema: JsonSchema;       // from z.toJSONSchema
  zod: z.ZodType<T>;            // the real contract
  context: Record<string, any>; // facts for the mock provider
  mock?: () => unknown;         // task-specific stand-in answer for the mock provider
  maxTokens?: number;
};
export type GenerateResult<T> = { ok: true; value: T; attempts: number; provider: string } | { ok: false; error: string; attempts: number; provider: string };

/** Token usage of every model call made inside usageScope.run(...) is added to its store (for cost tracking). */
export type Usage = { input: number; output: number; model: string | null };
export const usageScope = new AsyncLocalStorage<Usage>();

export const provider = () => (process.env.AI_PROVIDER ?? (process.env.ANTHROPIC_API_KEY ? "anthropic" : "mock")) as "anthropic" | "mock";

/** Rewrite a JSON Schema into the subset structured outputs accept, keeping the limits as text. */
export function toStructuredOutputSchema(s: JsonSchema): JsonSchema {
  if (Array.isArray(s)) return s.map(toStructuredOutputSchema) as any;
  if (!s || typeof s !== "object") return s;
  const out: JsonSchema = {};
  const notes: string[] = [];
  for (const [k, v] of Object.entries(s)) {
    if (k === "$schema") continue;
    if (k === "minLength") { notes.push(`at least ${v} characters`); continue; }
    if (k === "maxLength") { notes.push(`at most ${v} characters`); continue; }
    if (k === "minimum") { notes.push(`minimum ${v}`); continue; }
    if (k === "maximum") { notes.push(`maximum ${v}`); continue; }
    if (k === "minItems") { if (v > 1) notes.push(`at least ${v} items`); else out.minItems = v; continue; }
    if (k === "maxItems") { notes.push(`at most ${v} items`); continue; }
    if (k === "pattern") { notes.push(`must match ${v}`); continue; }
    if (k === "oneOf") { out.anyOf = (v as JsonSchema[]).map(toStructuredOutputSchema); continue; }
    if (k === "prefixItems") { out.items = toStructuredOutputSchema((v as JsonSchema[])[0]); notes.push(`exactly ${(v as JsonSchema[]).length} items`); continue; }
    out[k] = typeof v === "object" ? toStructuredOutputSchema(v) : v;
  }
  if (out.type === "object") out.additionalProperties = false;
  if (notes.length) out.description = [out.description, `(${notes.join("; ")})`].filter(Boolean).join(" ");
  return out;
}

async function callAnthropic(req: GenerateRequest<unknown>, feedback: string): Promise<unknown> {
  const res = await fetch(process.env.ANTHROPIC_API_URL ?? "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.AI_MODEL ?? "claude-sonnet-5-5",
      max_tokens: req.maxTokens ?? 4000,
      system: req.system,
      messages: [{ role: "user", content: req.user + feedback }],
      output_config: { format: { type: "json_schema", schema: toStructuredOutputSchema(req.jsonSchema) } },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Model API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { content: { type: string; text?: string }[]; stop_reason: string; model?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  const u = usageScope.getStore();
  if (u) { u.input += body.usage?.input_tokens ?? 0; u.output += body.usage?.output_tokens ?? 0; u.model = body.model ?? process.env.AI_MODEL ?? "claude-sonnet-5-5"; }
  if (body.stop_reason === "refusal") throw new Error("The model declined this request");
  if (body.stop_reason === "max_tokens") throw new Error("The answer was cut off (max_tokens)");
  const text = body.content.find((c) => c.type === "text")?.text ?? "";
  return JSON.parse(text);
}

/**
 * Test hook for the mock provider only: AI_MOCK_FAIL="block:faq@/faq" makes the first 3 calls for that
 * task on that page fail (one whole job), so tests can exercise the failure and Retry paths.
 */
const mockFailures = new Map<string, number>();
function simulatedFailure(req: GenerateRequest<unknown>) {
  const rule = process.env.AI_MOCK_FAIL;
  if (!rule) return false;
  const key = `${req.task}@${req.context?.page?.slug ?? ""}`;
  if (!rule.split(",").includes(key)) return false;
  const n = (mockFailures.get(key) ?? 0) + 1;
  mockFailures.set(key, n);
  return n <= 3;
}

/** Ask for JSON; validate with zod; on failure, retry twice with the validation errors. */
export async function generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
  const p = provider();
  let feedback = "";
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (p === "mock" && simulatedFailure(req as GenerateRequest<unknown>)) throw new Error("Simulated model failure (AI_MOCK_FAIL)");
      const raw = p === "anthropic" ? await callAnthropic(req as GenerateRequest<unknown>, feedback) : req.mock ? req.mock() : mockGenerate(req.jsonSchema, req.context, req.task);
      const parsed = req.zod.safeParse(raw);
      if (parsed.success) return { ok: true, value: parsed.data, attempts: attempt, provider: p };
      lastError = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      feedback = `\n\nYour previous answer did not validate. Fix these problems and answer again:\n${lastError}`;
    } catch (e) {
      lastError = String(e instanceof Error ? e.message : e);
      if (/401|403|invalid x-api-key/i.test(lastError)) break; // retrying will not help
    }
  }
  return { ok: false, error: lastError, attempts: 3, provider: p };
}
