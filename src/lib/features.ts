/**
 * Feature highlighting.
 *
 * Once we've recommended a plan, we say WHY — one or two real Neo features that this
 * particular person will actually use, tied to something they told us. "Contact form for
 * leads" means nothing in the abstract; "so enquiries stop living in your Instagram DMs"
 * lands, because they just told us that's where their orders come from.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────┐
 * │ THE MODEL DOES NOT CHOOSE THESE, AND MUST NEVER WRITE THEM.                       │
 * │ Every entry below is a real, shipped Neo feature. A hallucinated feature in front │
 * │ of the Neo product team is the single worst failure this demo could have, so the  │
 * │ bank is fixed and matching is deterministic — see pickFeatures().                 │
 * │                                                                                   │
 * │ Allow-list and provenance: docs/neo-product-facts.md, verified against Confluence │
 * │ NP/698843154 (Spec - Neo AI Site Builder) and a live product walk on 27 Aug 2026. │
 * │ BEFORE ADDING ONE: confirm it appears in that file. Marketing copy is not proof.  │
 * └──────────────────────────────────────────────────────────────────────────────────┘
 *
 * Two things the spec corrected, worth not re-breaking:
 *  - Neo's builder produces a ONE-PAGE landing site. Never imply multi-page.
 *  - "Generate design" picks template/colour/font RANDOMLY client-side, not via AI. So it is
 *    not listed here as an AI feature.
 */

import type { Profile } from "./engine";

export type FeatureSurface = "mail" | "site";

export interface Feature {
  id: string;
  /** Neo's own name for it. Do not rename to something snappier — it has to be findable. */
  name: string;
  surface: FeatureSurface;
  /**
   * Why THIS person cares. Written as a sentence completing "so that…". Keep it concrete
   * and tied to a signal — generic benefit copy is what we're trying to beat.
   */
  because: string;
  /** Returns true when this person's profile makes the feature genuinely relevant. */
  matches: (p: Profile) => boolean;
  /** Tie-break when several match. Higher wins. */
  priority: number;
}

const is = (p: Profile, k: string, v: unknown) => p[k] === v;

export const FEATURES: Feature[] = [
  {
    id: "contact-form",
    name: "Contact forms",
    surface: "site",
    because: "enquiries land in your inbox instead of your DMs",
    matches: (p) => is(p, "customerChannel", "social"),
    priority: 10,
  },
  {
    id: "bookings",
    name: "Neo Bookings",
    surface: "site",
    because: "people pick a slot themselves instead of messaging back and forth",
    matches: (p) => is(p, "sellsOnline", false) || is(p, "customerChannel", "offline"),
    priority: 8,
  },
  {
    id: "email-tracking",
    name: "Email tracking",
    surface: "mail",
    because: "you can see whether a quote was actually opened",
    matches: (p) => is(p, "sellsOnline", false) || is(p, "customerChannel", "personal_email"),
    priority: 7,
  },
  {
    id: "import",
    name: "Mail and contact import",
    surface: "mail",
    because: "your existing mail comes across, so nothing gets lost in the move",
    matches: (p) => p.importIntent !== undefined && p.importIntent !== "none",
    priority: 9,
  },
  {
    id: "smart-write",
    name: "AI Smart Write",
    surface: "mail",
    because: "replies to repeat enquiries stop eating your evenings",
    matches: (p) => is(p, "customerChannel", "social") || is(p, "customerChannel", "personal_email"),
    priority: 5,
  },
  {
    id: "campaigns",
    name: "Email Campaigns",
    surface: "mail",
    because: "you can tell past customers what's new without doing it one message at a time",
    matches: (p) => is(p, "sellsOnline", true),
    priority: 6,
  },
  {
    id: "site-analytics",
    name: "Site analytics",
    surface: "site",
    because: "you find out which page actually brings people in",
    matches: (p) => is(p, "customerChannel", "site"),
    priority: 6,
  },
  {
    id: "signature",
    name: "Signature designer",
    surface: "mail",
    because: "every mail you send looks like it came from a real business",
    matches: (p) => is(p, "currentClient", "gmail") || is(p, "customerChannel", "personal_email"),
    priority: 4,
  },
  /* Fallbacks — deliberately last, and always true, so we never render an empty block. */
  {
    id: "custom-domain",
    name: "Email @yourdomain",
    surface: "mail",
    because: "customers see your business name, not a generic address",
    matches: () => true,
    priority: 1,
  },
  {
    id: "templates",
    name: "Website templates",
    surface: "site",
    /* "one page" is deliberate — Neo's builder generates a one-page landing site
       (NP/698843154). Implying multi-page would be a claim their team would catch. */
    because: "your one-page site can change look later without rebuilding anything",
    matches: () => true,
    priority: 1,
  },
];

/**
 * Pick up to `limit` features for the surfaces in play. At most one per surface when both
 * are in play, so a mail+site recommendation shows one reason for each rather than two for
 * whichever matched hardest — the point is to justify the whole shape of the recommendation.
 */
export function pickFeatures(
  profile: Profile,
  surfaces: FeatureSurface[],
  limit = 2,
): Feature[] {
  const picked: Feature[] = [];

  for (const surface of surfaces) {
    const best = FEATURES.filter((f) => f.surface === surface && f.matches(profile)).sort(
      (a, b) => b.priority - a.priority,
    )[0];
    if (best) picked.push(best);
  }

  // Only one surface in play and room left — add its runner-up rather than pad with the
  // other surface, which they explicitly didn't ask for.
  if (picked.length < limit && surfaces.length === 1) {
    const more = FEATURES.filter(
      (f) => f.surface === surfaces[0] && f.matches(profile) && !picked.includes(f),
    ).sort((a, b) => b.priority - a.priority);
    picked.push(...more.slice(0, limit - picked.length));
  }

  return picked.slice(0, limit);
}
