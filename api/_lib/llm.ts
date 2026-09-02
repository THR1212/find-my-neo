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

/**
 * Read at CALL time, never captured into a module-level const.
 *
 * This bit them once already, and silently. `vite.config.ts` copies the LLM vars into
 * `process.env` from inside `configureServer`, which runs *after* the config module graph
 * — including this file — has been imported. A `const MODE = process.env.LLM_MODE` therefore
 * captured `undefined`, defaulted to "replay", and the dev server quietly served fixtures
 * while `.env.local` plainly said `LLM_MODE=live`.
 *
 * The failure had no symptom worth noticing: replay threw "no fixture for profile", the
 * profile route caught it and degraded, and the response was a perfectly ordinary HTTP 200.
 * You would demo an LLM product with the LLM switched off and never be told.
 *
 * On Vercel the env is present before any import, so this only ever bites in dev — which is
 * exactly where every prompt gets iterated. Keep these lazy.
 */
const mode = () => process.env.LLM_MODE ?? "replay";

// gpt-5.6-terra: $2/$12 per 1M in/out, proven in flock-partner-analysis.
// gpt-5.6-luna: $0.2/$1.2 — 10x cheaper, likely fine for profile extraction.
// Both do strict structured outputs. Terra is the safe default; Luna is the cost story.
const model = () => process.env.LLM_MODEL ?? "gpt-5.6-terra";

/** See the note at the call site. One retry, because a cold provider often works second try. */
const TIMEOUT_MS = 20000;

/**
 * Not cached across calls either: a cached client would pin the first key and base URL it
 * saw, reintroducing the same staleness one layer down.
 */
function getClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL || undefined,
  });
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
  if (mode() === "replay") {
    return replayFixture<T>(key, user);
  }

  /**
   * Hard ceiling on the model call.
   *
   * Without it, a provider that accepts the connection and then stalls holds the Edge
   * function until the platform kills it — the caller sees a generic function timeout, the
   * degraded path never runs, and the user gets an error screen instead of a working flow.
   * A bounded failure is a degradation; an unbounded one is an outage.
   *
   * 20s against a p50 of 3-6s. Generous enough that a slow-but-alive call still lands,
   * tight enough to stay inside the platform limit and leave room to fall back.
   */
  const res = await getClient().chat.completions.create(
    {
    model: model(),
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
    },
    { timeout: TIMEOUT_MS, maxRetries: 1 },
  );

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
