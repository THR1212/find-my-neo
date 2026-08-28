import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * The wait while Neo's generator runs.
 *
 * Measured live: 22–38 seconds. That is far too long to leave blank, and it is not a bug —
 * Neo's own UI shows a twelve-step loader for up to 24s for exactly this call.
 *
 * The step messages below are NEO'S OWN, verbatim from their spec (Confluence NP/698843154,
 * "Loading screen"). Using their words rather than inventing our own is the honest choice:
 * this genuinely is their generator running, and the wait is theirs too.
 *
 * Their rule, which we follow: show each step ~2s, do NOT loop, and hold on the last step if
 * generation is still running. Looping would make a 38s wait look like a hang.
 */

const STEPS = [
  "Preparing layout for your site…",
  "Choosing color theme and fonts…",
  "Crafting a headline…",
  "Writing a paragraph about your business…",
  "Adding sections…",
  "Choosing images…",
  "Writing positive testimonials…",
  "Adding a contact form…",
  "Adding social icons…",
  "Making the site mobile friendly…",
  "Adding the final touches…",
  "It's almost ready…",
];

const STEP_MS = 2200;

export default function NeoSiteGenerating() {
  const [i, setI] = useState(0);

  useEffect(() => {
    // Stop at the last step rather than wrapping — Neo's own spec says don't loop.
    if (i >= STEPS.length - 1) return;
    const t = setTimeout(() => setI((n) => n + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [i]);

  return (
    <div className="neo-gen" aria-live="polite">
      <div className="neo-gen-bar">
        <motion.div
          className="neo-gen-fill"
          initial={{ width: "4%" }}
          /* Eases toward — never reaching — 100%, so it can't claim to be done before it is. */
          animate={{ width: `${8 + (i / (STEPS.length - 1)) * 84}%` }}
          transition={{ duration: STEP_MS / 1000, ease: "easeInOut" }}
        />
      </div>

      <motion.p
        key={i}
        className="neo-gen-step"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {STEPS[i]}
      </motion.p>

      {/* Skeleton in the same shape as the finished card, so the swap doesn't jump. */}
      <div className="neo-gen-skeleton" aria-hidden="true">
        <div className="neo-gen-hero shimmer" />
        <div className="neo-gen-lines">
          <div className="shimmer" style={{ width: "72%", height: 13 }} />
          <div className="shimmer" style={{ width: "94%", height: 10 }} />
          <div className="shimmer" style={{ width: "56%", height: 10 }} />
        </div>
        <div className="neo-gen-tiles">
          <div className="shimmer" />
          <div className="shimmer" />
          <div className="shimmer" />
        </div>
      </div>
    </div>
  );
}
