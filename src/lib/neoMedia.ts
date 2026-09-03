/**
 * Neo's own product films and template shots, as used on neo.space.
 *
 * SELF-HOSTED, not hotlinked. The originals are the exact assets the marketing site loads —
 * captured 3 Sep 2026 from the homepage markup (`<video data-src=…>` in the "Small business
 * bundle" section, and the `template-horizontal-scroll*.webp` reel under "Beautiful
 * templates, ready for anything"). They now live in `public/neo/`, re-encoded for the size
 * they are actually displayed at; `docs/neo-media.md` records every source URL and the exact
 * ffmpeg commands, so any of them can be re-pulled when Neo updates its site.
 *
 * Serving them ourselves rather than from Neo's CDN means the reveal cannot break because a
 * marketing page was redeployed, and it drops a third-party request from the one screen that
 * has to look finished.
 *
 * Same rule as the site generator: show Neo's real output, never our impression of it. A
 * mock-up of Invoice Builder that we drew would be a claim about a product we do not own.
 *
 * They are muted, looping MP4s, not GIFs, which is what neo.space itself ships: an MP4 of the
 * same loop is roughly a tenth of the bytes and does not block the main thread.
 *
 * Captions are OURS. The product names are Neo's, verbatim from their feature catalogue —
 * see the header of features.ts. Do not invent a Neo product that is not in that file.
 */

export type MailPlanId = "starter" | "standard" | "max";

const MAIL_TIER: Record<MailPlanId, number> = { starter: 0, standard: 1, max: 2 };

export interface NeoClip {
  id: string;
  /** Neo's product name, verbatim. */
  name: string;
  /** Why this person specifically is being shown it. */
  caption: string;
  src: string;
  /**
   * Lowest mail plan that actually grants this, from `src/data/plan-features.json`.
   * Absent means every mail plan includes it (Starter, Standard and Max).
   */
  minMailPlan?: MailPlanId;
}

const VIDEOS = "/neo/videos";
const TEMPLATES = "/neo/templates";

/**
 * The mail-side bundle. Order is the default priority; `clipsFor` re-ranks per profile.
 * Every one of these is a real product on a paid Neo plan, not a roadmap item.
 */
export const MAIL_CLIPS: NeoClip[] = [
  {
    id: "invoice_builder",
    name: "Invoice Builder",
    caption: "Build the invoice and send it without leaving the inbox",
    src: `${VIDEOS}/invoice.mp4`,
    minMailPlan: "max",
  },
  {
    id: "bookings",
    name: "Neo Bookings",
    caption: "Customers pick a slot themselves instead of trading messages",
    src: `${VIDEOS}/bookings.mp4`,
    minMailPlan: "max",
  },
  {
    id: "signature",
    name: "Signature Designer",
    caption: "Every reply signs off with your name and your domain",
    src: `${VIDEOS}/signature.mp4`,
    minMailPlan: "standard",
  },
  {
    id: "email_designer",
    name: "Email Designer",
    caption: "Send something that looks designed, without a designer",
    src: `${VIDEOS}/designer.mp4`,
    minMailPlan: "max",
  },
  {
    id: "fast_apps",
    name: "Neo Mail apps",
    caption: "The same inbox on your phone and your desktop",
    src: `${VIDEOS}/apps.mp4`,
  },
];

/**
 * Which loops to show, most relevant first — but only features this mail plan actually grants.
 *
 * Ranking is profile-driven, exactly like pickFeatures: someone who takes payments gets
 * Invoice Builder first, if Max includes it. Entitlement comes from Darrel's Pandora sheet
 * (`plan-features.json`) and is the hard filter. A Starter recommendation must never loop
 * Invoice Builder, Bookings or Email Designer — those are Max-only. Signature Designer is
 * Standard and Max. Mail apps ship on every plan.
 *
 * If the plan is unknown, only the every-plan clips render: showing a Max film next to a
 * Starter price is worse than a quieter pane.
 */
export function clipsFor(
  profile: Record<string, unknown>,
  mailPlanId: string | null,
  limit = 3,
): NeoClip[] {
  const value = (key: string) => {
    const v = profile[key];
    return Array.isArray(v) ? v : [v];
  };
  const has = (key: string, v: unknown) => value(key).includes(v);
  const tier = mailPlanId && mailPlanId in MAIL_TIER ? MAIL_TIER[mailPlanId as MailPlanId] : 0;

  const score = (clip: NeoClip): number => {
    switch (clip.id) {
      case "invoice_builder":
        return has("sellsOnline", true) ? 100 : 40;
      case "bookings":
        return has("sellsOnline", false) ? 95 : 50;
      case "signature":
        return has("customerChannel", "personal_email") ? 90 : 60;
      case "email_designer":
        return has("customerChannel", "social") ? 70 : 45;
      case "fast_apps":
        return Number(profile.mailboxCount ?? profile.teamSize ?? 0) >= 2 ? 75 : 55;
      default:
        return 0;
    }
  };

  return [...MAIL_CLIPS]
    .filter((clip) => {
      if (!clip.minMailPlan) return true;
      return tier >= MAIL_TIER[clip.minMailPlan];
    })
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}

export interface NeoTemplateShot {
  id: string;
  label: string;
  src: string;
}

/**
 * Real screenshots from Neo's own template reel. Two, not seven: the point is "your site is
 * not locked to one look", and a wall of thumbnails would compete with the generated site
 * sitting directly above them.
 */
export const TEMPLATE_SHOTS: NeoTemplateShot[] = [
  { id: "studio", label: "Studio", src: `${TEMPLATES}/studio.webp` },
  { id: "storefront", label: "Storefront", src: `${TEMPLATES}/storefront.webp` },
  { id: "services", label: "Services", src: `${TEMPLATES}/services.webp` },
  { id: "hospitality", label: "Hospitality", src: `${TEMPLATES}/hospitality.webp` },
];

/**
 * Two shots, chosen from the domain stem so the pair is stable for a given business rather
 * than reshuffling on every render — but not identical for everyone.
 */
export function templateShotsFor(seed: string, count = 2): NeoTemplateShot[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const start = h % TEMPLATE_SHOTS.length;
  return Array.from(
    { length: Math.min(count, TEMPLATE_SHOTS.length) },
    (_, i) => TEMPLATE_SHOTS[(start + i) % TEMPLATE_SHOTS.length],
  );
}
