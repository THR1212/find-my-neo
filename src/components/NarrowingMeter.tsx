import { motion, useReducedMotion } from "framer-motion";
import {
  wordsMeterCopy,
  type MeterCopyContext,
  type MeterProfile,
  type MeterStage,
} from "./meterNumbersCopy";

const SIZE = 54;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function MeterRing({
  confidence,
  reduceMotion,
  busy = false,
}: {
  confidence: number;
  reduceMotion: boolean | null;
  /** Something is genuinely in flight. Adds a slow breath so a still ring does not read
      as a frozen one on the wait screen, where confidence cannot change. */
  busy?: boolean;
}) {
  return (
    <div className={`meter-ring${busy ? " is-busy" : ""}`}>
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
          transition={{ duration: reduceMotion ? 0 : 0.55, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
    </div>
  );
}

export default function NarrowingMeter({
  confidence,
  stage = "guess",
  lastQuestionId = null,
  profile = {},
  copyContext,
  busy = false,
}: {
  confidence: number;
  stage?: MeterStage;
  lastQuestionId?: string | null;
  profile?: MeterProfile;
  copyContext?: MeterCopyContext;
  busy?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const words = wordsMeterCopy(stage, lastQuestionId, profile, copyContext);

  return (
    <div className="meter meter--words">
      <MeterRing confidence={confidence} reduceMotion={reduceMotion} busy={busy} />
      <div className="meter-readout" aria-live="polite" aria-atomic="true">
        <motion.span
          key={words.title}
          className="meter-headline"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          {words.title}
        </motion.span>
        <span className="meter-label">{words.sub}</span>
      </div>
    </div>
  );
}
