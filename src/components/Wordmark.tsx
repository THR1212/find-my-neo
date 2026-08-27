import { motion } from "framer-motion";
import { PRODUCT_NAME } from "../lib/brand";

/**
 * The lockup on the opening screen.
 *
 * Deliberately NOT a copy of Neo's logo — faking someone's mark is worse than not using it.
 * Instead it reads as a Neo *sub-brand*: their Poppins, their blue→pink gradient on the word
 * "Neo", and a spark mark that belongs to this tool rather than to them.
 *
 * The gradient sweeps slowly. It is the first thing on screen and the only decoration the
 * hook gets, so it can afford to move; everything after it earns attention by narrowing.
 */
export default function Wordmark() {
  // "Find My Neo" -> lead words plain, "Neo" carries the gradient.
  const words = PRODUCT_NAME.split(" ");
  const lead = words.slice(0, -1).join(" ");
  const tail = words[words.length - 1];

  return (
    <motion.div
      className="wordmark"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.span
        className="wordmark-spark"
        aria-hidden="true"
        initial={{ scale: 0.6, rotate: -30, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18">
          <defs>
            <linearGradient id="wm-grad" x1="0" y1="1" x2="1" y2="0">
              <stop offset="20%" stopColor="#1078ff" />
              <stop offset="100%" stopColor="#fe4ca2" />
            </linearGradient>
          </defs>
          {/* Four-point spark — "we found it", not "AI magic wand". */}
          <path
            d="M12 1.6c.5 4.6 1.6 6.4 5.9 7.2 1.1.2 1.1 1.8 0 2-4.3.8-5.4 2.6-5.9 7.2-.1 1.1-1.7 1.1-1.8 0-.5-4.6-1.6-6.4-5.9-7.2-1.1-.2-1.1-1.8 0-2 4.3-.8 5.4-2.6 5.9-7.2.1-1.1 1.7-1.1 1.8 0z"
            fill="url(#wm-grad)"
          />
        </svg>
      </motion.span>

      <span className="wordmark-text">
        <span className="wordmark-lead">{lead}</span>{" "}
        <span className="wordmark-tail">{tail}</span>
      </span>
    </motion.div>
  );
}
