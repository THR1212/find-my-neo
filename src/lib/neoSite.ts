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
  const sites = await fetchNeoSites(businessName, description, industryKey);
  return sites[0] ?? null;
}

export async function fetchNeoSites(
  businessName: string,
  description: string,
  industryKey = "",
): Promise<NeoSite[]> {
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
      return fallbackSites(description);
    }
    const body = (await res.json()) as { site: NeoSite | null; sites?: NeoSite[]; error?: string };
    const raw = (body.sites?.length ? body.sites : body.site ? [body.site] : []).filter(Boolean);
    if (!raw.length) {
      reportDegraded("neo-site empty", body.error);
      return fallbackSites(description);
    }
    return raw.map((site) => ({ ...site, source: "live" as const }));
  } catch (err) {
    reportDegraded("neo-site unreachable", err instanceof Error ? err.message : String(err));
    return fallbackSites(description);
  } finally {
    clearTimeout(timer);
  }
}

function fallbackSites(description: string): NeoSite[] {
  const site = fallbackSite(description);
  return site ? [site] : [];
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

/**
 * Hero URLs from this generated site, preferred first.
 *
 * Two templates can resolve to the same Pexels photo (similar cover prompts). The second
 * card walks this list so it shows a different image from the SAME generation rather than
 * repeating the snapshot.
 */
export function heroCandidates(
  site: NeoSite,
  prefer: "landing" | "shop" = "landing",
): string[] {
  const intro = block(site, "introduction");
  const products = block(site, "products");
  const productList = ((products as Record<string, unknown> | null)?.productList ?? []) as Record<
    string,
    unknown
  >[];
  const urls: string[] = [];
  const add = (node: unknown) => {
    const u = imageUrl(site, node);
    if (u && !urls.includes(u)) urls.push(u);
  };

  if (prefer === "shop") {
    for (const p of productList) add(p.image);
    add((intro as Record<string, unknown> | null)?.mobileCoverImage);
    add((intro as Record<string, unknown> | null)?.desktopCoverImage);
    add((intro as Record<string, unknown> | null)?.image);
  } else {
    add((intro as Record<string, unknown> | null)?.desktopCoverImage);
    add((intro as Record<string, unknown> | null)?.mobileCoverImage);
    add((intro as Record<string, unknown> | null)?.image);
    for (const p of productList) add(p.image);
  }

  for (const u of Object.values(site.images)) {
    if (u && !urls.includes(u)) urls.push(u);
  }
  return urls;
}

export function pickHero(
  site: NeoSite,
  prefer: "landing" | "shop" = "landing",
  avoid?: string | null,
  fallback?: NeoSite | null,
): string | null {
  const all = heroCandidates(site, prefer);
  const unique = all.find((u) => u !== avoid);
  if (unique) return unique;
  if (fallback && avoid) {
    const other = heroCandidates(fallback, "shop").find((u) => u !== avoid);
    if (other) return other;
  }
  return all[0] ?? null;
}

/** A short, human label for the chosen template, e.g. "offline_services" -> "Offline services". */
export function templateLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
