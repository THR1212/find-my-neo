/**
 * Provider seam. Every model call in this project goes through `complete()`.
 *
 * Two things this buys us:
 *  1. The exact model ID is config, not code. Ignite hands us the LLM plan; whether
 *     it ends up being one model or another is an env var change.
 *  2. Replay mode. `LLM_MODE=replay` returns pre-recorded responses instantly, with
 *     no network. That is the demo path (venue wifi is not a dependency we accept),
 *     the rehearsal loop, and the prompt-iteration harness.
 *
 * Callers must not know which mode they got.
 */

import OpenAI from "openai";
import { replayFixture } from "./replay.js";

const MODE = process.env.LLM_MODE ?? "replay";
const MODEL = process.env.LLM_MODEL ?? "";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.LLM_API_KEY,
      // Ignite may hand us a gateway rather than the vendor's own endpoint.
      // Unset falls back to the SDK default.
      baseURL: process.env.LLM_BASE_URL || undefined,
    });
  }
  return client;
}

export interface CompleteArgs<T> {
  /** Fixture key used in replay mode. Also the cache/prompt identity. */
  key: string;
  system: string;
  user: string;
  /** JSON Schema the response must conform to. */
  schema: Record<string, unknown>;
  schemaName: string;
}

/**
 * Returns a structured object. Never free text — the profile and the reveal are
 * both machine-consumed downstream (rules.ts maps profile -> plan).
 */
export async function complete<T>({
  key,
  system,
  user,
  schema,
  schemaName,
}: CompleteArgs<T>): Promise<T> {
  if (MODE === "replay") {
    return replayFixture<T>(key, user);
  }

  if (!MODEL) throw new Error("LLM_MODEL is unset and LLM_MODE is not 'replay'");

  // NOTE: verify this call shape against whatever endpoint Ignite actually
  // provisions before hour 1 of the hackathon. If the provider exposes a
  // different structured-output mechanism, this function is the only thing
  // that changes — nothing above it should move.
  const res = await getClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: schemaName, schema, strict: true },
    },
  });

  const raw = res.choices[0]?.message?.content;
  if (!raw) throw new Error("empty completion");
  return JSON.parse(raw) as T;
}
