/**
 * Provider seam. Every model call in this project goes through `complete()`.
 *
 * Two things this buys us:
 *  1. The exact model ID is config, not code (LLM_MODEL).
 *  2. Replay mode. `LLM_MODE=replay` returns pre-recorded responses instantly, with
 *     no network. That is the demo path, the rehearsal loop, and the prompt-iteration
 *     harness. A caller must never know which mode it got.
 *
 * gpt-5.6 gotchas below are NOT guesses — they were paid for in the flock-partner-analysis
 * project (see its CLAUDE.md "Analyzer" section). Do not re-litigate them:
 *   - gpt-5.6-* REJECTS `temperature` at any value, including 0. Never send it.
 *   - The parameter is `max_completion_tokens`, NOT `max_tokens`. Sending max_tokens 400s.
 *   - Endpoint is chat.completions (not the Responses API), with
 *     response_format: {type:"json_schema", json_schema:{name, strict:true, schema}}.
 *   - finish_reason === "length" means the JSON is truncated and JSON.parse will throw
 *     something unhelpful. Check it first and say so.
 */

import OpenAI from "openai";
import { replayFixture } from "./replay.js";

const MODE = process.env.LLM_MODE ?? "replay";

// gpt-5.6-terra: $2/$12 per 1M in/out, proven in flock-partner-analysis.
// gpt-5.6-luna: $0.2/$1.2 — 10x cheaper, likely fine for profile extraction.
// Both do strict structured outputs. Terra is the safe default; Luna is the cost story.
const MODEL = process.env.LLM_MODEL ?? "gpt-5.6-terra";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.LLM_API_KEY,
      baseURL: process.env.LLM_BASE_URL || undefined,
    });
  }
  return client;
}

export interface CompleteArgs {
  /** Fixture key in replay mode; also the prompt's identity for recording. */
  key: string;
  system: string;
  user: string;
  /** JSON Schema. Needs additionalProperties:false and a full `required` list for strict mode. */
  schema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens?: number;
}

/**
 * Returns a structured object, never free text. The profile and the reveal are both
 * machine-consumed downstream — rules.ts maps profile -> plan, and the model is never
 * allowed to pick a price.
 */
export async function complete<T>({
  key,
  system,
  user,
  schema,
  schemaName,
  maxOutputTokens = 4096,
}: CompleteArgs): Promise<T> {
  if (MODE === "replay") {
    return replayFixture<T>(key, user);
  }

  const res = await getClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: schemaName, strict: true, schema },
    },
    // NOT max_tokens. See header.
    max_completion_tokens: maxOutputTokens,
    // NO temperature. gpt-5.6-* rejects it outright. See header.
  });

  const choice = res.choices[0];
  if (choice?.finish_reason === "length") {
    throw new Error(
      `[${key}] output truncated at max_completion_tokens=${maxOutputTokens}; ` +
        `the JSON is incomplete. Raise the ceiling or shrink the prompt.`,
    );
  }

  const raw = choice?.message?.content;
  if (!raw) throw new Error(`[${key}] empty completion`);
  return JSON.parse(raw) as T;
}
