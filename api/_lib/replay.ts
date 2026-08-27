/**
 * Replay mode. Pre-recorded model responses, served with no network call.
 *
 * Why this exists: the reveal is the one screen that must be perfect, and Ignite
 * provides no hosting and no guarantee about venue wifi. A demo whose money shot
 * sits behind a network round-trip is a demo that can fail live. Replay is cheap
 * to build now as an interface decision and painful to retrofit at hour 40.
 *
 * Recording: run in live mode with LLM_RECORD=1 and the responses land in
 * src/data/replay/<key>.json. Curate the good ones, commit them, demo off those.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const FIXTURE_DIR = path.join(process.cwd(), "src", "data", "replay");

/** Deliberate delay so replay feels like the real thing rather than instant. */
const FAKE_LATENCY_MS = Number(process.env.LLM_REPLAY_LATENCY_MS ?? 900);

export async function replayFixture<T>(key: string, _input: string): Promise<T> {
  const file = path.join(FIXTURE_DIR, `${key}.json`);
  let body: string;
  try {
    body = await readFile(file, "utf8");
  } catch {
    throw new Error(
      `No replay fixture for "${key}". Expected ${file}. ` +
        `Record one with LLM_MODE=live LLM_RECORD=1, or add it by hand.`,
    );
  }
  await new Promise((r) => setTimeout(r, FAKE_LATENCY_MS));
  return JSON.parse(body) as T;
}
