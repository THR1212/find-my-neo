import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  closerMeterCopy,
  wordsMeterCopy,
  type MeterProfile,
  type MeterStage,
} from "./meterNumbersCopy";

/**
 * Number-free narrowing. The engine still tells us *that* the set shrank (pulse),
 * but we never print 5,318 — we do not have data to stand behind that figure.
 */

const SIZE = 54;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export type MeterVariant = "words" | "closer" | "ring";

export const METER_VARIANTS: { id: MeterVariant; label: string; hint: string }[] = [
  {
    id: "words",
    label: "Words",
    hint: "Recommended without data. Ring + what we just learned (DMs, Gmail…). No count.",
  },
  {
    id: "closer",
    label: "Closer",
    hint: "“Getting closer” and five dots as the ring fills. Honest progress, no specifics.",
  },
  {
    id: "ring",
    label: "Ring",
    hint: "Only the ring and a short status. Quietest option.",
  },
];

function MeterRing({
  confidence,
  dropping,
  reduceMotion,
}: {
  confidence: number;
  dropping: boolean;
  reduceMotion: boolean | null;
}) {
  return (
    <motion.div
      className="meter-ring"
      initial={false}
      animate={dropping && !reduceMotion ? { scale: [1, 1.1, 1] } : { scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--meter-track)"
          strokeWidth={STROKE}
        />
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--meter-fill)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          initial={false}
          animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - confidence) }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
    </motion.div>
  );
}

function MatchPips({ confidence }: { confidence: number }) {
  const filled = Math.min(5, Math.max(0, Math.round(confidence * 5)));
  return (
    <div className="meter-pips" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} className={i < filled ? "is-on" : undefined} />
      ))}
    </div>
  );
}

export default function NarrowingMeter({
  confidence,
  remaining,
  variant,
  stage = "guess",
  lastQuestionId = null,
  profile = {},
}: {
  confidence: number;
  remaining: number;
  variant: MeterVariant;
  stage?: MeterStage;
  lastQuestionId?: string | null;
  profile?: MeterProfile;
}) {
  const reduceMotion = useReducedMotion();
  const prevRemaining = useRef(remaining);
  const [drop, setDrop] = useState(false);

  useEffect(() => {
    const previous = prevRemaining.current;
    if (remaining < previous) {
      setDrop(true);
      const id = window.setTimeout(() => setDrop(false), 780);
      prevRemaining.current = remaining;
      return () => window.clearTimeout(id);
    }
    prevRemaining.current = remaining;
  }, [remaining]);

  const dropping = drop;
  const words = wordsMeterCopy(stage, lastQuestionId, profile);
  const closer = closerMeterCopy(confidence);
  const ringLine =
    stage === "reveal" ? "Your setup" : closer.title === "Your setup" ? "Almost there" : closer.title;

  return (
    <div className={`meter meter--${variant}${dropping ? " is-dropping" : ""}`}>
      <MeterRing confidence={confidence} dropping={dropping} reduceMotion={reduceMotion} />

      {variant === "words" && (
        <div className="meter-readout" aria-live="polite" aria-atomic="true">
          <motion.span
            key={words.title}
            className={`meter-headline${dropping ? " is-dropping" : ""}`}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            {words.title}
          </motion.span>
          <span className="meter-label">{dropping ? "that helped" : words.sub}</span>
        </div>
      )}

      {variant === "closer" && (
        <div className="meter-readout" aria-live="polite" aria-atomic="true">
          <span className={`meter-headline${dropping ? " is-dropping" : ""}`}>{closer.title}</span>
          <MatchPips confidence={confidence} />
          <span className="meter-label">{dropping ? "that helped" : closer.sub}</span>
        </div>
      )}

      {variant === "ring" && (
        <div className="meter-readout" aria-live="polite" aria-atomic="true">
          <span className={`meter-headline${dropping ? " is-dropping" : ""}`}>{ringLine}</span>
          <span className="meter-label">{stage === "reveal" ? "ready for you" : "matching you"}</span>
        </div>
      )}
    </div>
  );
}
