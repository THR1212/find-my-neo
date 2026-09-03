/**
 * Neo's own site generator, called server-side.
 *
 * This is the piece that stops us pretending to build sites. Instead of drafting our own copy,
 * we call Neo's real generator with the business name and description we derived, and show what
 * Neo would actually produce. Verified working server-to-server on 28 Aug 2026 — no auth, no
 * cookies, no Origin header, no CAPTCHA (see docs/neo-product-facts.md).
 *
 * Three calls, in order:
 *   1. POST /neo/generate/unauth   t:"bi"  -> {industryKey, templateKey, businessName}
 *   2. POST /neo/generate/unauth   t:"sc"  -> full site: font, pallet, 17 content blocks
 *   3. POST /files/images/search/bulk/unauth -> resolves image prompts to Pexels URLs
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────┐
 * │ UNDOCUMENTED INTERNAL API ON PRODUCTION. Three rules:                             │
 * │  - Keep volume low. One pass per user session, never a loop or a retry storm.     │
 * │  - Mark it: every `crid` we send carries `neotest` so Neo can filter our traffic. │
 * │  - Assume it can vanish. Every failure path falls back to the recorded fixture    │
 * │    in src/data/replay/neo-site.json, which is a REAL captured response.           │
 * │ Fine for a hackathon demo; shipping on it needs Neo's agreement.                  │
 * └──────────────────────────────────────────────────────────────────────────────────┘
 *
 * Gotchas paid for in testing — do not rediscover:
 *  - `crid` is REQUIRED on the image endpoint too, not just generate. Omitting it 400s
 *    with `parameter: "crid"`.
 *  - The image endpoint also requires a `gid` UUIDv4.
 *  - `sq` is capped at 10 items per request. Sending 20 returns `400 parameter: "sq"`.
 *    Batch it.
 *  - `p` on the generate endpoint is a JSON *string*, not a nested object.
 */

const API = "https://api.titan.email";

/** Every request is tagged so Neo can identify and filter our traffic in their analytics. */
function crid(tag: string): string {
  return `w_neotest_${tag}_${Math.floor(Date.now() / 1000)}`;
}

function uuid(): string {
  // crypto.randomUUID exists in Node 18+ and the Edge runtime.
  return globalThis.crypto?.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000";
}

async function post(path: string, body: unknown, timeoutMs = 25000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

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
  /** image prompt -> resolved Pexels URL */
  images: Record<string, string | null>;
  /** Where this came from, so the UI can be honest about it if it ever matters. */
  source: "live" | "fixture";
}

/** Step 1 — classify the business. */
async function classify(industryKey: string, description: string) {
  /* ik is required. The captured working value is `ecommerce_retail` (not
     `ecommerce_and_retail`). Copy still comes from the description. */
  const ik = industryKey || "ecommerce_retail";
  const out = await post("/neo/generate/unauth", {
    crid: crid("bi"),
    t: "bi",
    p: JSON.stringify({ ik, bd: description }),
  });
  return JSON.parse(out.v) as {
    industryKey: string;
    templateKey: string;
    businessName: string;
  };
}

/** Step 2 — generate the site content. */
async function generateContent(
  businessName: string,
  description: string,
  templateKey: string,
  industryKey: string,
) {
  const out = await post(
    "/neo/generate/unauth",
    {
      crid: crid("sc"),
      t: "sc",
      p: JSON.stringify({
        bn: businessName,
        bd: description,
        d: { template_key: templateKey, industry_key: industryKey },
        bks: null,
        requireBlocksAsList: true,
      }),
    },
    80000, // content generation is the slow one; must outlast nothing but the client's 90s
  );
  return JSON.parse(out.v) as Omit<NeoSite, "images" | "source">;
}

/** Walk the block tree and collect every image prompt, de-duplicated, in order. */
function collectPrompts(blocks: NeoBlock[]): { q: string; bk: string }[] {
  const seen = new Set<string>();
  const out: { q: string; bk: string }[] = [];

  const walk = (node: unknown, bk: string): void => {
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, bk));
    } else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        // Neo keys these as e.g. "prompt/url/img/bk:h"
        if (typeof v === "string" && k.includes("prompt")) {
          if (!seen.has(v)) {
            seen.add(v);
            out.push({ q: v, bk });
          }
        } else {
          walk(v, bk);
        }
      }
    }
  };

  blocks.forEach((b) => walk(b.data, b.key));
  return out;
}

/** Step 3 — resolve prompts to real images. Batched at 10; more than that is a 400. */
async function resolveImages(
  prompts: { q: string; bk: string }[],
  industryKey: string,
): Promise<Record<string, string | null>> {
  const images: Record<string, string | null> = {};
  const BATCH = 10;

  for (let i = 0; i < prompts.length; i += BATCH) {
    const chunk = prompts.slice(i, i + BATCH);
    try {
      const out = await post("/files/images/search/bulk/unauth", {
        crid: crid(`img${i}`),
        gid: uuid(),
        industry_key: industryKey,
        sq: chunk.map((c, idx) => ({ qid: idx, q: c.q, bk: c.bk })),
      });
      for (const r of out?.respList ?? []) {
        const src = chunk[r.qid];
        if (src) images[src.q] = r.url ?? null;
      }
    } catch {
      // A failed image batch is survivable — the block renders without a picture.
      // Losing the whole site because one batch 500'd would not be.
      for (const c of chunk) if (!(c.q in images)) images[c.q] = null;
    }
  }
  return images;
}

/**
 * The whole pipeline. Throws only if steps 1–2 fail; image failure degrades quietly.
 * Callers are expected to catch and fall back to the fixture.
 *
 * Two templates, not one. The email+site reveal shows a pair of generator snapshots for
 * THIS business. That is one classify plus two content passes (different template keys),
 * still tagged `neotest` — not a retry storm, and not Neo's marketing reel of other shops.
 */
export async function generateNeoSite(
  businessName: string,
  description: string,
  industryKey: string,
): Promise<NeoSite> {
  const sites = await generateNeoSites(businessName, description, industryKey, 1);
  return sites[0];
}

/**
 * Templates Neo's generator has actually returned for small-business descriptions.
 * `property` is omitted on purpose — it is the mismatch that turned a bakery into
 * "Real Estate" (docs/neo-product-facts.md).
 */
const OTHER_TEMPLATES = [
  "speciality_retail",
  "offline_services",
  "fashion_store",
  "creator",
  "bio_site",
  "logistics",
];

async function generateOne(
  businessName: string,
  description: string,
  templateKey: string,
  industryKey: string,
): Promise<NeoSite> {
  const site = await generateContent(businessName, description, templateKey, industryKey);
  const images = await resolveImages(collectPrompts(site.blocks), site.industryKey);
  return { ...site, images, source: "live" };
}

export async function generateNeoSites(
  businessName: string,
  description: string,
  industryKey: string,
  count = 2,
): Promise<NeoSite[]> {
  const classified = await classify(industryKey, description);
  const name = classified.businessName || businessName;
  const ik = classified.industryKey;
  const firstKey = classified.templateKey;
  const keys = [firstKey];
  if (count > 1) {
    const alt = OTHER_TEMPLATES.find((k) => k !== firstKey) ?? "speciality_retail";
    keys.push(alt);
  }

  const settled = await Promise.allSettled(
    keys.map((key) => generateOne(name, description, key, ik)),
  );
  const sites: NeoSite[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    if (sites.some((s) => s.templateKey === result.value.templateKey)) continue;
    sites.push(result.value);
  }
  if (!sites.length) {
    const err = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    throw err?.reason instanceof Error ? err.reason : new Error("neo site generation failed");
  }
  return sites;
}
