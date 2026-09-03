/**
 * Client seam for Neo's site generator.
 *
 * Live-first with a real fallback: we call our own /api/neo-site, and if anything goes wrong —
 * network, timeout, Neo changing or withdrawing the endpoint — we fall back to a RECORDED
 * response in src/data/replay/neo-site.json. That fixture is genuine Neo output captured on
 * 28 Aug 2026, not something hand-written, so the fallback can never show the user something
 * Neo wouldn't actually have produced.
 *
 * The endpoint is undocumented and unauthenticated *today*. Treat it as something that may
 * disappear without notice — which is exactly why the fallback exists and why nothing above
 * this file is allowed to know which path it got.
 */

import fixture from "../data/replay/neo-site.json";
import { reportDegraded } from "./errorLog";

export interface NeoBlock {
  key: string;
  data: Record<string, unknown>;
}

export interface NeoSite {
  templateKey: string;
  industryKey: string;
  siteCategory?: string;
  font: string;
  pallet: string;
  blocks: NeoBlock[];
  images: Record<string, string | null>;
  source: "live" | "fixture";
}

const FIXTURE: NeoSite = { ...(fixture as unknown as NeoSite), source: "fixture" };

/** The recorded fallback is Proof & Butter. Only show it when that is what they typed. */
export function fixtureFitsDescription(description: string): boolean {
  const t = description.toLowerCase();
  return /proof\s*&?\s*butter|sourdough|celebration cake|bakery in bandra/.test(t);
}

/**
 * Generation takes real time on Neo's side — measured at 22–38s, and their own UI shows a
 * 12-step loader for up to 24s.
 *
 * 90s, not 45s. The earlier 45s was cutting it close against a measured 38s worst case, and on
 * hackathon venue wifi that margin disappears. Falling back shows the RECORDED bakery response
 * to someone who typed a different business — which is the single most visible way this demo
 * can embarrass itself in front of judges. Waiting is strictly better than being wrong, and the
 * loader (Neo's own step copy) makes the wait feel intentional rather than hung.
 */
const TIMEOUT_MS = 90000;

function fallbackSite(description: string): NeoSite | null {
  return fixtureFitsDescription(description) ? FIXTURE : null;
}

export async function fetchNeoSite(
  businessName: string,
  description: string,
  industryKey = "",
): Promise<NeoSite | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("/api/neo-site", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        bn: businessName,
        bd: description,
        ...(industryKey ? { ik: industryKey } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      reportDegraded("neo-site http", String(res.status));
      return fallbackSite(description);
    }
    const body = (await res.json()) as { site: NeoSite | null; error?: string };
    if (!body.site) {
      reportDegraded("neo-site empty", body.error);
      return fallbackSite(description);
    }
    return { ...body.site, source: "live" };
  } catch (err) {
    /* Includes the timeout. Worth knowing: if this fires for everyone, Neo's generator is
       down or has changed. Do not paint the bakery over a cinema. */
    reportDegraded("neo-site unreachable", err instanceof Error ? err.message : String(err));
    return fallbackSite(description);
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Reading Neo's block format ---------- */

/** Find a block by key. Neo always returns all 17, but some come back empty. */
export function block(site: NeoSite, key: string): Record<string, unknown> | null {
  return site.blocks.find((b) => b.key === key)?.data ?? null;
}

/** Resolve an image node to a URL. Neo keys prompts as e.g. "prompt/url/img/bk:h". */
export function imageUrl(site: NeoSite, node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (typeof v !== "string") continue;
    // Already a URL (live responses sometimes inline one)
    if (v.startsWith("http")) return v;
    if (k.includes("prompt")) return site.images[v] ?? null;
  }
  return null;
}

export function str(data: Record<string, unknown> | null, key: string): string | null {
  const v = data?.[key];
  return typeof v === "string" && v.trim() ? v : null;
}

/** A short, human label for the chosen template, e.g. "offline_services" -> "Offline services". */
export function templateLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
