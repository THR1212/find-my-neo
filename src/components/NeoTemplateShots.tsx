import { motion } from "framer-motion";
import { templateShotsFor } from "../lib/neoMedia";

/**
 * Two real screenshots from Neo's template reel, under the generated site.
 *
 * Why it is here: Neo's generator picks a template non-deterministically — the same
 * description has come back as six different ones across runs (docs/neo-product-facts.md).
 * Showing a second look is the honest way to say "the content is yours, the skin is a
 * choice", rather than implying the one card above is final.
 */
export default function NeoTemplateShots({ seed }: { seed: string }) {
  const shots = templateShotsFor(seed, 2);

  return (
    <div className="tpl-shots">
      <p className="story-kicker">Other looks Neo can apply</p>
      <div className="tpl-shots-row">
        {shots.map((shot, i) => (
          <motion.figure
            key={shot.id}
            className="tpl-shot"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <img src={shot.src} alt={`${shot.label} template`} loading="lazy" />
            <figcaption>{shot.label}</figcaption>
          </motion.figure>
        ))}
      </div>
    </div>
  );
}
