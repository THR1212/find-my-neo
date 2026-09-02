import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * The narrowing indicator: a ring that fills and a count that collapses.
 *
 * This is the gamification. Akinator works because you watch it close in on you — without a
 * visible narrowing signal this is a form with nice transitions. The count is the real
 * number of distinct business_industry strings in Neo's persona data (5,318), so the
 * data-quality finding is *inside* the experience rather than sitting on a slide.
 *
 * The number animates by spring rather than stepping, because a value that visibly tumbles
 * from 5,318 to 340 is doing the persuading here. When remaining falls, the chip also pulses
 * and a signed delta flashes — a quiet spring is easy to miss on a busy reveal.
 */

const SIZE = 54;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function NarrowingMeter({
  confidence,
  remaining,
}: {
  /** 0–1 */
  confidence: number;
  remaining: number;
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
  const tight = drop?.tight ?? remaining <= 12;

  return (
    <div
      className={`meter${dropping ? " is-dropping" : ""}${tight && dropping ? " is-tight" : ""}`}
    >
      <motion.div
        className="meter-ring"
        initial={false}
        animate={
          dropping && !reduceMotion ? { scale: [1, 1.1, 1] } : { scale: 1 }
        }
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
            /* Rotate so the ring starts at 12 o'clock rather than 3. */
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            initial={false}
            animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - confidence) }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
      </motion.div>

      <div className="meter-readout" aria-live="polite" aria-atomic="true">
        <div className="meter-count-row">
          <motion.span
            className={`meter-count${dropping ? " is-dropping" : ""}`}
            initial={false}
            animate={
              dropping && !reduceMotion ? { scale: [1, 1.16, 1] } : { scale: 1 }
            }
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
        <span className="meter-label">
          possible setups{remaining <= 12 ? " left" : ""}
        </span>
      </div>
    </div>
  );
}
