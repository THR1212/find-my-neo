import { motion } from "framer-motion";
import { SURFACE_OPTIONS, type SurfaceChoice } from "../lib/session";

/**
 * Screen 4 — mail only, or mail plus a site. The last question before the reveal, and the
 * one that decides how much of the reveal has content in it.
 */
export default function Surface({
  onChoose,
}: {
  onChoose: (choice: SurfaceChoice) => void;
}) {
  return (
    <div>
      <p className="eyebrow">Last one</p>
      <h1>What do you need standing up?</h1>
      <p className="lede">You can add the other half later — nothing here is permanent.</p>

      <div className="options">
        {SURFACE_OPTIONS.map((opt, i) => (
          <motion.button
            key={opt.id}
            className="option"
            onClick={() => onChoose(opt.id)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * i, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {opt.label}
            <span className="option-hint">{opt.hint}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
