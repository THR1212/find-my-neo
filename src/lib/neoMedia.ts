/**
 * Neo's own product films and template shots, as used on neo.space.
 *
 * These are the exact public asset URLs the marketing site loads (captured 3 Sep 2026 from
 * the homepage markup: `<video data-src=...>` in the "Small business bundle" section, and the
 * `template-horizontal-scroll*.webp` reel under "Beautiful templates, ready for anything").
 * We hotlink Neo's CDN on purpose — the same rule as the site generator: show Neo's real
 * output rather than something we drew that merely looks like it.
 *
 * They are muted, looping MP4s, not GIFs, which is why nothing here decodes a .gif: an MP4
 * of the same loop is roughly a tenth of the bytes and does not block the main thread.
 *
 * Captions are OURS. The product names are Neo's, verbatim from their feature catalogue —
 * see the header of features.ts. Do not invent a Neo product that is not in that file.
 */

export interface NeoClip {
  id: string;
  /** Neo's product name, verbatim. */
  name: string;
  /** Why this person specifically is being shown it. */
  caption: string;
  src: string;
}

const FLOCK = "https://static.flock.co/neo/website/videos";
const WEBFLOW = "https://cdn.prod.website-files.com/6380708edae368c5674306ee";

/**
 * The mail-side bundle. Order is the default priority; `clipsFor` re-ranks per profile.
 * Every one of these is a real product on a paid Neo plan, not a roadmap item.
 */
export const MAIL_CLIPS: NeoClip[] = [
  {
    id: "invoice_builder",
    name: "Invoice Builder",
    caption: "Build the invoice and send it without leaving the inbox",
    src: `${FLOCK}/Neo_IB_final.mp4`,
  },
  {
    id: "bookings",
    name: "Neo Bookings",
    caption: "Customers pick a slot themselves instead of trading messages",
    src: `${FLOCK}/Appointment_Booking.mp4`,
  },
  {
    id: "signature",
    name: "Signature Designer",
    caption: "Every reply signs off with your name and your domain",
    src: `${FLOCK}/Signature-Builder.mp4`,
  },
  {
    id: "email_designer",
    name: "Email Designer",
    caption: "Send something that looks designed, without a designer",
    src: `${FLOCK}/ED.mp4`,
  },
  {
    id: "fast_apps",
    name: "Neo Mail apps",
    caption: "The same inbox on your phone and your desktop",
    src: `${WEBFLOW}/65035c87854b97797c0ad0a7_Fast%20Apps%2002-transcode.mp4`,
  },
];

/** The site-side film: a generated one-page site going live. */
export const SITE_LAUNCH_CLIP: NeoClip = {
  id: "website_launch",
  name: "AI-powered site builder",
  caption: "One description in, a one-page site out",
  src: `${FLOCK}/Website_Launch.mp4`,
};

/**
 * Which loops to show, most relevant first.
 *
 * Deterministic and profile-driven, exactly like pickFeatures — someone who takes payments
 * gets Invoice Builder first; someone who only takes enquiries gets Bookings. Nothing here
 * is model-written.
 */
export function clipsFor(
  profile: Record<string, unknown>,
  limit = 3,
): NeoClip[] {
  const value = (key: string) => {
    const v = profile[key];
    return Array.isArray(v) ? v : [v];
  };
  const has = (key: string, v: unknown) => value(key).includes(v);

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

  return [...MAIL_CLIPS].sort((a, b) => score(b) - score(a)).slice(0, limit);
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
  {
    id: "t1",
    label: "Studio",
    src: `${WEBFLOW}/674db18c56a1cbebbcefacb6_template-horizontal-scroll1.webp`,
  },
  {
    id: "t3",
    label: "Storefront",
    src: `${WEBFLOW}/674db18b27bed59220306062_template-horizontal-scroll3.webp`,
  },
  {
    id: "t5",
    label: "Services",
    src: `${WEBFLOW}/674db18bf9d959ec7aaf732a_template-horizontal-scroll5.webp`,
  },
  {
    id: "t6",
    label: "Hospitality",
    src: `${WEBFLOW}/674db18b57c47c10cf39c84a_template-horizontal-scroll6.webp`,
  },
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
