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

/**
 * Generation takes real time on Neo's side — the browser flow shows a 12-step loader for up to
 * 24 seconds. We allow 45s before giving up, because falling back early would show the bakery
 * fixture to someone who typed something else, which is worse than waiting.
 */
const TIMEOUT_MS = 45000;

export async function fetchNeoSite(
  businessName: string,
  description: string,
  industryKey = "ecommerce_retail",
): Promise<NeoSite> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const qs = new URLSearchParams({ bn: businessName, bd: description, ik: industryKey });
    const res = await fetch(`/api/neo-site?${qs}`, { signal: controller.signal });
    if (!res.ok) {
      reportDegraded("neo-site http", String(res.status));
      return FIXTURE;
    }
    const body = (await res.json()) as { site: NeoSite | null; error?: string };
    if (!body.site) {
      reportDegraded("neo-site empty", body.error);
      return FIXTURE;
    }
    return { ...body.site, source: "live" };
  } catch (err) {
    /* Includes the 45s timeout. Worth knowing: if this fires for everyone, Neo's generator is
       down or has changed, and every visitor is silently seeing the bakery. */
    reportDegraded("neo-site unreachable", err instanceof Error ? err.message : String(err));
    return FIXTURE;
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
