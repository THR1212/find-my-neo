import { motion } from "framer-motion";
import { templateShotsFor } from "../lib/neoMedia";

/**
 * The second template in the site-builder pair: a real shot from Neo's template reel,
 * framed in the same browser chrome as the generated site so the two cards read as
 * two generator outputs, not a preview plus a thumbnail.
 */
export default function NeoTemplateShots({ seed }: { seed: string }) {
  const shot = templateShotsFor(seed, 1)[0];
  if (!shot) return null;

  return (
    <motion.div
      className="neo-site tpl-look"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="neo-site-chrome">
        <span className="neo-dot" />
        <span className="neo-dot" />
        <span className="neo-dot" />
        <span className="neo-site-title">{shot.label} template</span>
      </div>
      <div className="tpl-look-page">
        <img src={shot.src} alt={`${shot.label} template`} />
      </div>
      <div className="neo-site-foot">
        <span>{shot.label} look Neo can apply</span>
      </div>
    </motion.div>
  );
}
