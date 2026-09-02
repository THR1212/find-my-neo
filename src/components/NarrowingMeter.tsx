import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { numbersMeterLabel, type MeterProfile, type MeterStage } from "./meterNumbersCopy";

/**
 * The narrowing indicator. Three demo treatments — the engine still feeds confidence +
 * remaining; this file only changes how a person reads them. Bands are placeholders until
 * the data work lands. Do not invent a new remaining count here.
 */

const SIZE = 54;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export type MeterVariant = "numbers" | "closer" | "bands";

export const METER_VARIANTS: { id: MeterVariant; label: string; hint: string }[] = [
  {
    id: "numbers",
    label: "Numbers",
    hint: "The count stays. The line under it changes each step (DMs, starting fresh, Gmail…).",
  },
  {
    id: "closer",
    label: "Closer",
    hint: "No digits. “Getting closer” as the ring fills. Suggested default for a layperson.",
  },
  {
    id: "bands",
    label: "Shortlist",
    hint: "Plain-language bands (lots / like yours / a handful). Swap the cutoffs when data lands.",
  },
];

function closerCopy(confidence: number): { title: string; sub: string } {
  if (confidence < 0.2) return { title: "Finding your setup", sub: "Start with what you do" };
  if (confidence < 0.45) return { title: "Getting closer", sub: "That narrowed it" };
  if (confidence < 0.7) return { title: "Taking shape", sub: "A few more details" };
  if (confidence < 0.88) return { title: "Almost there", sub: "Nearly locked in" };
  return { title: "Ready for you", sub: "Your setup" };
}

/** Placeholder buckets on today's remaining() — replace when the data colleague ships cutoffs. */
function bandCopy(remaining: number): { title: string; sub: string } {
  if (remaining > 2000) return { title: "Lots of matches", sub: "We'll narrow this down" };
  if (remaining > 400) return { title: "A smaller field", sub: "Businesses in a similar space" };
  if (remaining > 40) return { title: "Like yours", sub: "Getting specific" };
  if (remaining > 12) return { title: "A shortlist", sub: "Almost yours" };
  return { title: "Your setup", sub: "Locked in" };
}

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
  /** Last answered question id — the drop on this screen is because of that answer. */
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
  const closer = closerCopy(confidence);
  const band = bandCopy(remaining);
  const numbersLabel = numbersMeterLabel(remaining, stage, lastQuestionId, profile);

  return (
    <div
      className={`meter meter--${variant}${dropping ? " is-dropping" : ""}${tight && dropping ? " is-tight" : ""}`}
    >
      <MeterRing confidence={confidence} dropping={dropping} reduceMotion={reduceMotion} />

      {variant === "numbers" && (
        <div className="meter-readout" aria-live="polite" aria-atomic="true">
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
            key={numbersLabel}
            className="meter-label"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            {numbersLabel}
          </motion.span>
        </div>
      )}

      {variant === "closer" && (
        <div className="meter-readout" aria-live="polite" aria-atomic="true">
          <span className={`meter-headline${dropping ? " is-dropping" : ""}`}>{closer.title}</span>
          <MatchPips confidence={confidence} />
          <span className="meter-label">
            {dropping ? "That helped" : closer.sub}
          </span>
        </div>
      )}

      {variant === "bands" && (
        <div className="meter-readout" aria-live="polite" aria-atomic="true">
          <span className={`meter-headline${dropping ? " is-dropping" : ""}`}>{band.title}</span>
          <span className="meter-label">
            {dropping ? "Narrowed again" : band.sub}
          </span>
        </div>
      )}
    </div>
  );
}
