import { motion } from "framer-motion";
import { IMPORT_OPTIONS, type ImportChoice } from "../lib/session";

/**
 * Screen 3 — import intent.
 *
 * This question earns its slot on evidence, not intuition: in the 2023-24 persona data,
 * users who imported mail and contacts retained at ~82% against a 36% baseline. It is the
 * single strongest retention signal in the set. (n=102 on the strongest cut, so directional
 * — and the levels are from an older product state. See docs/handoff.md §4.)
 *
 * Option labels are Neo's live survey set, lightly reworded for a conversational flow.
 */
export default function ImportQuestion({
  onChoose,
}: {
  onChoose: (choice: ImportChoice) => void;
}) {
  return (
    <div>
      <p className="eyebrow">Question 2 of 3</p>
      <h1>Bringing anything with you?</h1>
      <p className="lede">
        If you've got mail or contacts somewhere else, we can move them across for you.
      </p>

      <div className="options">
        {IMPORT_OPTIONS.map((opt, i) => (
          <motion.button
            key={opt.id}
            className="option"
            onClick={() => onChoose(opt.id)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * i, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {opt.label}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
