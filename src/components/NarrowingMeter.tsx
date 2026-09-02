import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { numbersMeterLabel, type MeterProfile, type MeterStage } from "./meterNumbersCopy";

/**
 * The narrowing indicator: a ring that fills and a count that collapses.
 *
 * Copy under the count follows the last answer in plain English. On the last screen the
 * leftover floor (3) is hidden — that number is an engine detail, not three products.
 */

const SIZE = 54;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

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

export default function NarrowingMeter({
  confidence,
  remaining,
  stage = "guess",
  lastQuestionId = null,
  profile = {},
}: {
  confidence: number;
  remaining: number;
  stage?: MeterStage;
  lastQuestionId?: string | null;
  profile?: MeterProfile;
}) {
  const count = useMotionValue(remaining);
  const spring = useSpring(count, { stiffness: 55, damping: 18 });
  const rounded = useTransform(spring, (v) => Math.round(v).toLocaleString("en-IN"));
  const reduceMotion = useReducedMotion();
  const prevRemaining = useRef(remaining);
  const [drop, setDrop] = useState<{ delta: number; tight: boolean } | null>(null);

  useEffect(() => {
    count.set(remaining);
  }, [remaining, count]);

  useEffect(() => {
    const previous = prevRemaining.current;
    if (remaining < previous) {
      setDrop({ delta: previous - remaining, tight: remaining <= 12 });
      const id = window.setTimeout(() => setDrop(null), 780);
      prevRemaining.current = remaining;
      return () => window.clearTimeout(id);
    }
    prevRemaining.current = remaining;
  }, [remaining]);

  const dropping = drop !== null;
  const tight = Boolean(drop?.tight);
  const label = numbersMeterLabel(remaining, stage, lastQuestionId, profile);

  return (
    <div
      className={`meter meter--numbers${dropping ? " is-dropping" : ""}${tight && dropping ? " is-tight" : ""}`}
    >
      <MeterRing confidence={confidence} dropping={dropping} reduceMotion={reduceMotion} />

      <div className="meter-readout" aria-live="polite" aria-atomic="true">
        {stage === "reveal" ? (
          <>
            <span className={`meter-headline${dropping ? " is-dropping" : ""}`}>Your setup</span>
            <span className="meter-label">{label}</span>
          </>
        ) : (
          <>
            <div className="meter-count-row">
              <motion.span
                className={`meter-count${dropping ? " is-dropping" : ""}`}
                initial={false}
                animate={dropping && !reduceMotion ? { scale: [1, 1.16, 1] } : { scale: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                style={{ originX: 0, originY: 0.5 }}
              >
                {rounded}
              </motion.span>
              {drop ? (
                <span className="meter-delta" aria-hidden="true">
                  −{drop.delta.toLocaleString("en-IN")}
                </span>
              ) : null}
            </div>
            <motion.span
              key={label}
              className="meter-label"
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              {label}
            </motion.span>
          </>
        )}
      </div>
    </div>
  );
}
