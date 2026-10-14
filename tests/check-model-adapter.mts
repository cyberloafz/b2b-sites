/**
 * Checks the Anthropic adapter against a local fake API (no network, no key):
 * request shape (model, version header, structured-output schema rewritten to the supported subset),
 * zod validation, and retry with the validation errors fed back.
 *   npx tsx tests/check-model-adapter.mts
 */
import { createServer } from "node:http";
import { z } from "zod";

const requests: { headers: Record<string, unknown>; body: any }[] = [];
const answers = [
  JSON.stringify({ title: "This title is far too long for the limit we set on it, so validation must fail", description: "short" }),
  JSON.stringify({ title: "Private Label BBQ Sauce | Prairie Pantry", description: "Private label barbecue sauces from an SQF Level 2 plant in Omaha, NE. Minimums from 500 units per SKU. Request samples and a quote." }),
];
const server = createServer((req, res) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    requests.push({ headers: req.headers, body: JSON.parse(data) });
    const text = answers[Math.min(requests.length - 1, answers.length - 1)];
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn", model: "claude-sonnet-5-5", usage: { input_tokens: 100, output_tokens: 20 } }));
  });
});

async function main() {
  await new Promise<void>((r) => server.listen(4566, r));
  process.env.AI_PROVIDER = "anthropic";
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_API_URL = "http://127.0.0.1:4566/v1/messages";
  const { generate, usageScope } = await import("../lib/ai/model");
  const usage = { input: 0, output: 0, model: null as string | null };
  const schema = z.object({ title: z.string().min(1).max(60), description: z.string().min(70).max(160) });
  const r = await usageScope.run(usage, () => generate({ task: "seo", system: "sys", user: "write it", jsonSchema: z.toJSONSchema(schema), zod: schema, context: {} }));
  const results: [string, boolean][] = [];
  const first = requests[0]?.body;
  const fmt = first?.output_config?.format;
  results.push(["answer accepted on attempt 2", r.ok && r.attempts === 2]);
  results.push(["x-api-key and anthropic-version headers sent", requests[0]?.headers["x-api-key"] === "test-key" && requests[0]?.headers["anthropic-version"] === "2023-06-01"]);
  results.push(["default model claude-sonnet-5-5", first?.model === "claude-sonnet-5-5"]);
  results.push(["structured output json_schema", fmt?.type === "json_schema"]);
  results.push(["additionalProperties false", fmt?.schema?.additionalProperties === false]);
  results.push(["length limits moved into descriptions", !JSON.stringify(fmt?.schema).includes("maxLength") && /at most 60 characters/.test(fmt?.schema?.properties?.title?.description ?? "")]);
  results.push(["no $schema key", !("$schema" in (fmt?.schema ?? {}))]);
  results.push(["validation errors fed back on retry", /did not validate[\s\S]*title/.test(requests[1]?.body?.messages?.[0]?.content ?? "")]);
  results.push(["token usage of both attempts recorded for cost tracking", usage.input === 200 && usage.output === 40 && usage.model === "claude-sonnet-5-5"]);
  for (const [name, ok] of results) console.log((ok ? "PASS " : "FAIL ") + name);
  server.close();
  process.exit(results.every(([, ok]) => ok) ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
