import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

/**
 * The narrowing indicator: a ring that fills and a count that collapses.
 *
 * This is the gamification. Akinator works because you watch it close in on you — without a
 * visible narrowing signal this is a form with nice transitions. The count is the real
 * number of distinct business_industry strings in Neo's persona data (5,318), so the
 * data-quality finding is *inside* the experience rather than sitting on a slide.
 *
 * The number animates by spring rather than stepping, because a value that visibly tumbles
 * from 5,318 to 340 is doing the persuading here.
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

  useEffect(() => {
    count.set(remaining);
  }, [remaining, count]);

  return (
    <div className="meter">
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

      <div className="meter-readout">
        <motion.span className="meter-count">{rounded}</motion.span>
        <span className="meter-label">
          possible setups{remaining <= 12 ? " left" : ""}
        </span>
      </div>
    </div>
  );
}
