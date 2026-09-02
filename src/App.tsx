import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import {
  applyAnswer,
  confidence,
  nextQuestion,
  remainingSetups,
  shouldReveal,
  type EngineState,
} from "./lib/engine";
import { buildProfile } from "./lib/api";
import { fetchNeoSite, type NeoSite } from "./lib/neoSite";
import type { RevealContent } from "./lib/session";

import NarrowingMeter, { type MeterVariant } from "./components/NarrowingMeter";
import MeterPreviewSwitch from "./components/MeterPreviewSwitch";
import SoundToggle from "./components/SoundToggle";
import { playSound } from "./sound";
import { DISTINCT_INDUSTRY_VALUES } from "./data/industryUniverse";
import Hook from "./screens/Hook";
import Describe from "./screens/Describe";
import Guess from "./screens/Guess";
import AdaptiveQuestion from "./screens/AdaptiveQuestion";
import Reveal from "./screens/Reveal";

type Stage = "hook" | "describe" | "guess" | "question" | "reveal";

const transition = { duration: 0.32, ease: [0.16, 1, 0.3, 1] as const };
const variants = {
  enter: { opacity: 0, y: 10 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const emptyEngine: EngineState = { profile: {}, asked: [], freeText: {} };

function readMeterVariant(): MeterVariant {
  const q = new URLSearchParams(window.location.search).get("meter");
  if (q === "numbers" || q === "words" || q === "closer" || q === "ring") return q;
  return "numbers";
}

export default function App() {
  const [stage, setStage] = useState<Stage>("hook");
  const [meterVariant, setMeterVariant] = useState<MeterVariant>(readMeterVariant);
  const [engine, setEngine] = useState<EngineState>(emptyEngine);
  const [rawText, setRawText] = useState("");
  const [reveal, setReveal] = useState<RevealContent | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  /** The model's suggestion for what to ask next. Advisory — the engine can overrule it. */
  const [preferredQuestionId, setPreferredQuestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Neo's real generated site. Fired alongside the profile call on screen-1 submit, because
   * their generator is genuinely slow (their own UI shows a 12-step loader for up to 24s).
   * Starting it any later and the reveal would sit waiting on it.
   */
  const [neoSite, setNeoSite] = useState<NeoSite | null>(null);

  const conf = useMemo(() => confidence(engine.profile), [engine.profile]);
  const remaining = useMemo(() => remainingSetups(engine.profile), [engine.profile]);
  const meterRemaining =
    stage === "hook" || stage === "describe" ? DISTINCT_INDUSTRY_VALUES : remaining;
  const current = useMemo(
    () => nextQuestion(engine, preferredQuestionId),
    [engine, preferredQuestionId],
  );

  /**
   * Screen-1 submit. Fires the profile request AND advances immediately — it resolves while
   * the user reads the guess and answers questions, so the reveal is already in memory by
   * the time they reach it. Do not await before advancing.
   */
  const submitDescription = useCallback((text: string) => {
    setRawText(text);
    setLoading(true);
    setError(null);
    setStage("guess");

    /* Kick Neo's generator off immediately and in parallel — it is the slowest thing in the
       flow by a wide margin, and it must be ready by the time they reach the reveal.
       fetchNeoSite never rejects; it falls back to a recorded real response. */
    fetchNeoSite("", text).then(setNeoSite);

    buildProfile(text)
      .then((res) => {
        setSummary(res.profile.summary);
        setReveal(res.reveal);
        setPreferredQuestionId(res.nextQuestionId ?? null);
        // Seed the engine with what the free text alone told us. This is why the ring
        // opens partly filled rather than empty.
        setEngine((prev) => ({
          ...prev,
          profile: {
            ...prev.profile,
            industry: res.profile.industry,
            brandName: res.profile.domainStem,
            ...(res.profile.teamSize ? { teamSize: res.profile.teamSize } : {}),
          },
        }));
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, []);

  /**
   * Apply an answer and decide where to go next.
   *
   * Computed from `engine` directly rather than inside a setState updater: React double-invokes
   * updaters under StrictMode, so a setStage() in there fires twice and the flow can repeat a
   * question it already asked. State updaters must stay pure — the routing decision belongs here.
   */
  const answer = useCallback(
    (questionId: string, optionIds: string[], freeText?: string) => {
      const next = applyAnswer(engine, questionId, optionIds, freeText);
      setPreferredQuestionId(null); // consumed; engine picks from here on
      setEngine(next);
      setStage(shouldReveal(next) ? "reveal" : "question");
    },
    [engine],
  );

  const rejectGuess = useCallback(() => {
    setStage("describe");
    setSummary(null);
    setReveal(null);
    setError(null);
    setEngine(emptyEngine);
  }, []);

  const restart = useCallback(() => {
    setStage("hook");
    setEngine(emptyEngine);
    setRawText("");
    setReveal(null);
    setSummary(null);
    setPreferredQuestionId(null);
    setError(null);
  }, []);

  const stepNumber = engine.asked.length + 1;
  const screenKey = stage === "question" ? `q-${current?.id ?? "none"}` : stage;

  const chooseMeter = useCallback((next: MeterVariant) => {
    setMeterVariant(next);
    const url = new URL(window.location.href);
    url.searchParams.set("meter", next);
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.get("meter")) {
      url.searchParams.set("meter", meterVariant);
      window.history.replaceState(null, "", url);
    }
  }, [meterVariant]);

  return (
    <>
      <div className="backdrop" aria-hidden="true">
        <div className="bloom bloom-1" />
        <div className="bloom bloom-2" />
        <div className="bloom bloom-3" />
      </div>
      <div className="grain" aria-hidden="true" />

      <AnimatePresence>
        <motion.div
          className="meter-dock"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={transition}
        >
          <NarrowingMeter
            confidence={conf}
            remaining={meterRemaining}
            variant={meterVariant}
            stage={stage}
            lastQuestionId={engine.asked[engine.asked.length - 1] ?? null}
            profile={engine.profile}
          />
        </motion.div>
      </AnimatePresence>

      <SoundToggle />
      <MeterPreviewSwitch value={meterVariant} onChange={chooseMeter} />

      <main className="stage">
        <AnimatePresence mode="wait">
          <motion.div
            key={screenKey}
            className="screen"
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transition}
          >
            {stage === "hook" && <Hook onStart={() => setStage("describe")} />}

            {stage === "describe" && (
              <Describe onSubmit={submitDescription} initialText={rawText} />
            )}

            {stage === "guess" && (
              <Guess
                summary={summary}
                teamSize={engine.profile.teamSize as number | undefined}
                loading={loading}
                error={error}
                onConfirm={() => {
                  playSound("mcq");
                  setStage("question");
                }}
                onReject={rejectGuess}
              />
            )}

            {stage === "question" && current && (
              <AdaptiveQuestion question={current} step={stepNumber} onAnswer={answer} />
            )}

            {stage === "reveal" && (
              <Reveal
                reveal={reveal}
                loading={loading}
                error={error}
                surface={(engine.profile.surface as string) ?? null}
                teamSize={(engine.profile.teamSize as number) ?? null}
                profile={engine.profile}
                businessText={rawText}
                neoSite={neoSite}
                onRestart={restart}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </>
  );
}
