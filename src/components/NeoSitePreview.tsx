import { motion } from "framer-motion";
import { block, imageUrl, str, type NeoSite } from "../lib/neoSite";

/**
 * Renders Neo's ACTUAL generated site, not our invented copy.
 *
 * Compact snapshot: chrome, hero, headline, a line of copy, CTA. That is the card Neo's
 * own generator shows, and it is small enough that the recommendation column next to a
 * pair of them does not have to scroll. Product thumbs and the provenance footer are
 * omitted here — they were the bits that overflowed the locked viewport.
 *
 * `look: shop` is only used when we have a single generation and still need a second
 * card: it is the products block from the SAME site, not a screenshot of someone else.
 */
export default function NeoSitePreview({
  site,
  delay = 0,
  look = "landing",
}: {
  site: NeoSite;
  delay?: number;
  look?: "landing" | "shop";
}) {
  const header = block(site, "header");
  const intro = block(site, "introduction");
  const products = block(site, "products");
  const productList = ((products as any)?.productList ?? []) as Record<string, unknown>[];
  const firstProduct = productList[0];

  const landingHero = imageUrl(site, (intro as any)?.desktopCoverImage ?? (intro as any)?.image);
  const shopHero =
    (firstProduct ? imageUrl(site, firstProduct.image) : null) ??
    imageUrl(site, (intro as any)?.mobileCoverImage);
  const heroUrl = look === "shop" ? (shopHero ?? landingHero) : landingHero;

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
