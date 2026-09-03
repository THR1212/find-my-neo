import { motion } from "framer-motion";
import { templateShotsFor } from "../lib/neoMedia";

/**
 * One other look from Neo's template reel, shown next to the generated site.
 *
 * Two large panes, not a strip of thumbnails under the preview: the strip sat in a 96px
 * slot at the bottom of a locked viewport and the shots were not actually viewable.
 */
export default function NeoTemplateShots({ seed }: { seed: string }) {
  const shot = templateShotsFor(seed, 1)[0];
  if (!shot) return null;

  return (
    <motion.div
      className="tpl-pane tpl-pane-shot"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <img src={shot.src} alt={`${shot.label} template`} />
      <p className="tpl-pane-caption">{shot.label} look Neo can apply</p>
    </motion.div>
  );
}
