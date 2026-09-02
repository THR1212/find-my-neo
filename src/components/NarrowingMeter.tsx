import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { DISTINCT_INDUSTRY_VALUES } from "../data/industryUniverse";
import {
  closerMeterCopy,
  numbersMeterLabel,
  wordsMeterCopy,
  type MeterProfile,
  type MeterStage,
} from "./meterNumbersCopy";

const SIZE = 54;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export type MeterVariant = "numbers" | "words" | "closer" | "ring";

export const METER_VARIANTS: { id: MeterVariant; label: string; hint: string }[] = [
  {
    id: "numbers",
    label: "Numbers",
    hint: "5,318 distinct industries from Neo persona data (Sheet13, n=13,833). The count ticks down as answers land.",
  },
  {
    id: "words",
    label: "Words",
    hint: "Ring + what we just learned (DMs, Gmail…). No count.",
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
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          strokeDasharray={CIRCUMFERENCE}
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
  const count = useMotionValue(DISTINCT_INDUSTRY_VALUES);
  const spring = useSpring(count, { stiffness: 55, damping: 18 });
  const rounded = useTransform(spring, (v) => Math.round(v).toLocaleString("en-IN"));
  const reduceMotion = useReducedMotion();
  const prevRemaining = useRef(remaining);
  const [drop, setDrop] = useState<{ delta: number; tight: boolean } | null>(null);

  const hideCount = stage === "reveal";

  useEffect(() => {
    if (hideCount) return;
    if (reduceMotion) {
      count.jump(remaining);
      return;
    }
    count.set(remaining);
  }, [remaining, count, reduceMotion, hideCount]);

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
  const words = wordsMeterCopy(stage, lastQuestionId, profile);
  const closer = closerMeterCopy(confidence);
  const ringLine =
    stage === "reveal" ? "Your setup" : closer.title === "Your setup" ? "Almost there" : closer.title;
  const numberLabel = hideCount
    ? "ready for you"
    : numbersMeterLabel(remaining, stage, lastQuestionId, profile);

  return (
    <div
      className={`meter meter--${variant}${dropping ? " is-dropping" : ""}${tight && dropping ? " is-tight" : ""}`}
    >
      <MeterRing confidence={confidence} dropping={dropping} reduceMotion={reduceMotion} />

      {variant === "numbers" && (
        <div className="meter-readout" aria-live="polite" aria-atomic="true">
          {hideCount ? (
            <>
              <span className={`meter-headline${dropping ? " is-dropping" : ""}`}>Your setup</span>
              <span className="meter-label">{numberLabel}</span>
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
              <span className="meter-label">{dropping ? "that helped" : numberLabel}</span>
            </>
          )}
        </div>
      )}

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
