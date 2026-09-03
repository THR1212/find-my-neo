import { motion } from "framer-motion";
import { block, pickHero, str, type NeoSite } from "../lib/neoSite";

/**
 * Renders Neo's ACTUAL generated site, not our invented copy.
 *
 * Compact snapshot: chrome, hero, headline, a line of copy, CTA. That is the card Neo's
 * own generator shows, and it is small enough that the recommendation column next to a
 * pair of them does not have to scroll.
 *
 * `avoidHero` skips a URL the other card is already showing — two templates often share
 * a cover prompt and would otherwise paint the same photo twice.
 */
export default function NeoSitePreview({
  site,
  delay = 0,
  look = "landing",
  avoidHero = null,
  fallbackSite = null,
}: {
  site: NeoSite;
  delay?: number;
  look?: "landing" | "shop";
  avoidHero?: string | null;
  fallbackSite?: NeoSite | null;
}) {
  const header = block(site, "header");
  const intro = block(site, "introduction");
  const products = block(site, "products");

  const heroUrl = pickHero(site, look, avoidHero, fallbackSite);
  const title = str(header, "title") ?? "Your site";
  const heading =
    look === "shop" ? (str(products, "heading") ?? str(intro, "heading")) : str(intro, "heading");
  const description = str(intro, "description");
  const cta =
    look === "shop"
      ? (((products as any)?.mainButton?.buttonLabel as string) ??
        ((intro as any)?.mainButton?.buttonLabel as string) ??
        null)
      : (((intro as any)?.mainButton?.buttonLabel as string) ?? null);

  return (
    <motion.div
      className="neo-site neo-site-compact"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="neo-site-chrome">
        <span className="neo-dot" />
        <span className="neo-dot" />
        <span className="neo-dot" />
        <span className="neo-site-title">{title}</span>
      </div>

      {heroUrl && (
        <div className="neo-site-hero">
          <img src={heroUrl} alt="" loading="lazy" />
        </div>
      )}

      <div className="neo-site-body">
        {heading && <p className="neo-site-heading">{heading}</p>}
        {description && <p className="neo-site-desc">{description}</p>}
        {cta && <span className="neo-site-cta">{cta}</span>}
      </div>
    </motion.div>
  );
}
