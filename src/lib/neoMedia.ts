/**
 * Neo's own product films and template shots, as used on neo.space.
 *
 * SELF-HOSTED, not hotlinked. The originals are the exact assets the marketing site loads —
 * captured 3 Sep 2026 from the homepage markup (`<video data-src=…>` in the "Small business
 * bundle" section, the AI site-builder film, and the `template-horizontal-scroll*.webp` reel
 * under "Beautiful templates, ready for anything"). They now live in `public/neo/`, re-encoded
 * for the size they are actually displayed at (hero wait card ~880px, not a 150px thumbnail);
 * `docs/neo-media.md` records every source URL and the exact ffmpeg commands, so any of them
 * can be re-pulled when Neo updates its site.
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
  /** Wait-reel category label. Omit on the mail-only reveal — that pane is already one category. */
  kicker?: string;
  /**
   * The `features.ts` id this film is OF, when the two names differ.
   *
   * They mostly do: this file names clips after the footage (`bookings`, `signature`,
   * `fast_apps`) and features.ts names them after Pandora entitlements
   * (`appointment_booking`, `signature_builder`, `multi_device_support`). Only
   * `invoice_builder` happens to match.
   *
   * Without this the mail-only pane cannot tell that its "Signature Designer" film and its
   * "Signature Designer" feature card are the same thing, and shows both.
   */
  featureId?: string;
}

const VIDEOS = "/neo/videos";
const TEMPLATES = "/neo/templates";
const FEATURES_DIR = "/neo/features";

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
  featureId: "appointment_booking",
    name: "Neo Bookings",
    caption: "Customers pick a slot themselves instead of trading messages",
    src: `${VIDEOS}/bookings.mp4`,
    minMailPlan: "max",
  },
  {
    id: "signature",
  featureId: "signature_builder",
    name: "Signature Designer",
    caption: "Every reply signs off with your name and your domain",
    src: `${VIDEOS}/signature.mp4`,
    minMailPlan: "max",
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
  featureId: "mobile_apps",
    name: "Neo Mail apps",
    caption: "The same inbox on your phone and your desktop",
    src: `${VIDEOS}/apps.mp4`,
  },
];

function mailClip(id: string): NeoClip {
  const clip = MAIL_CLIPS.find((c) => c.id === id);
  if (!clip) throw new Error(`neoMedia: missing mail clip "${id}"`);
  return clip;
}

/**
 * The wait reel — one flagship from each thing the lede names (mail, a site, inbox tools).
 * Not the full mail catalogue: four overlapping mail films felt like a product dump, and the
 * site half of Neo vanished for ten seconds. These are still Neo's own films, not mock-ups.
 *
 * Plan gating does not apply here. The profile (and therefore the plan) has not landed yet;
 * this is a look at the product, not a promise about the recommended tier.
 */
export const SITE_CLIP: NeoClip = {
  id: "site_builder",
  featureId: "neo_site",
  name: "AI-powered site builder",
  caption: "A one-page site generated from what you just described",
  src: `${VIDEOS}/site.mp4`,
};

export const WAIT_CLIPS: NeoClip[] = [
  { ...mailClip("fast_apps"), kicker: "Mail" },
  { ...SITE_CLIP, kicker: "Site" },
  { ...mailClip("invoice_builder"), kicker: "Inbox tools" },
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

/**
 * Neo's own per-feature artwork, one asset per entitlement.
 *
 * Found on the PRICING page (03 Sep) rather than the homepage the films came from — the
 * feature table there loads `static.flock.co/meta/plan/feature/images/<key>.png|gif|webp`, 36
 * of them, keyed almost exactly the way `features.ts` is. Several are ANIMATED, and three of
 * them cover features that had no film at all: read receipts, multi-account and one-click
 * import — which between them are most of what a Starter reveal can honestly show.
 *
 * Same rule as the films and the site generator: this is Neo's real artwork, vendored rather
 * than hotlinked so a marketing redeploy cannot empty the last screen. Nothing here is drawn
 * or reinterpreted by us. Provenance in docs/neo-media.md.
 *
 * Keyed by OUR feature id, not Neo's file name, because the two differ often enough
 * (`smart_write` is `titan_ai`, `multi_account` is `multi_device_support`) that the mapping
 * has to be written down rather than derived.
 */
export const FEATURE_ART: Record<string, string> = {
  mobile_apps: `${FEATURES_DIR}/mobile_apps.png`,
  email_rule: `${FEATURES_DIR}/email_rule.png`,
  shareable_calendar: `${FEATURES_DIR}/shareable_calender.png`,
  turbo_search: `${FEATURES_DIR}/turbo_search.png`,
  priority_inbox: `${FEATURES_DIR}/priority_inbox.png`,
  storage: `${FEATURES_DIR}/storage.png`,
  import_email_contacts: `${FEATURES_DIR}/one_click_import.gif`,
  multi_device_support: `${FEATURES_DIR}/multi_account.gif`,
  read_receipts: `${FEATURES_DIR}/read_receipt.png`,
  invoice_builder: `${FEATURES_DIR}/invoice_builder.gif`,
  titan_ai: `${FEATURES_DIR}/smart_write.gif`,
  email_marketing: `${FEATURES_DIR}/email_marketing.gif`,
  appointment_booking: `${FEATURES_DIR}/appointment_booking.gif`,
  signature_builder: `${FEATURES_DIR}/signature_builder.png`,
};

/** Art for a feature, or null. Null is normal — `gmail_sync`, `imap_pop` and `custom_domain`
 *  have no asset in Neo's set, and a card without art is better than a borrowed picture. */
export function featureArt(featureId: string): string | null {
  return FEATURE_ART[featureId] ?? null;
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
