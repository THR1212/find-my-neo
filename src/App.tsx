import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import {
  applyAnswer,
  confidence,
  nextQuestion,
  shouldReveal,
  type EngineState,
} from "./lib/engine";
import { buildProfile, fetchQuestionSurface } from "./lib/api";
import { fetchNeoSite, type NeoSite } from "./lib/neoSite";
import { clearSnapshot, loadSnapshot, saveSnapshot, type Stage } from "./lib/persist";
import type { RevealContent } from "./lib/session";

import NarrowingMeter from "./components/NarrowingMeter";
import { playSound, unlockSound } from "./sound";
import Hook from "./screens/Hook";
import Describe from "./screens/Describe";
import Guess from "./screens/Guess";
import AdaptiveQuestion from "./screens/AdaptiveQuestion";
import Reveal from "./screens/Reveal";

const transition = { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };
const variants = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

const emptyEngine: EngineState = { profile: {}, asked: [], freeText: {} };

export default function App() {
  /**
   * Read once, as a lazy initialiser, so the restored screen is what paints first. Reading it
   * in an effect instead would flash the hook screen and then jump, which reads as a bug.
   */
  const [restored] = useState(loadSnapshot);

  const [stage, setStage] = useState<Stage>(restored?.stage ?? "hook");
  const [engine, setEngine] = useState<EngineState>(restored?.engine ?? emptyEngine);
  const [rawText, setRawText] = useState(restored?.rawText ?? "");
  const [reveal, setReveal] = useState<RevealContent | null>(restored?.reveal ?? null);
  const [summary, setSummary] = useState<string | null>(restored?.summary ?? null);
  /** The model's suggestion for what to ask next. Advisory — the engine can overrule it. */
  const [preferredQuestionId, setPreferredQuestionId] = useState<string | null>(
    restored?.preferredQuestionId ?? null,
  );
  /**
   * Never restored. A snapshot taken mid-flight would otherwise come back as a spinner with
   * no request behind it; the resume effect below re-fires the work instead.
   */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Neo's real generated site. Fired alongside the profile call on screen-1 submit, because
   * their generator is genuinely slow (their own UI shows a 12-step loader for up to 24s).
   * Starting it any later and the reveal would sit waiting on it.
   */
  const [neoSite, setNeoSite] = useState<NeoSite | null>(restored?.neoSite ?? null);

  /**
   * Current stage, readable from inside async callbacks.
   *
   * `kickOff` closes over the stage at call time, which is always "guess" — so it cannot tell
   * whether the person has since moved on. A ref is the only thing that reads live here.
   */
  const stageRef = useRef<Stage>(stage);
  stageRef.current = stage;

  const conf = useMemo(() => confidence(engine.profile), [engine.profile]);
  const current = useMemo(
    () => nextQuestion(engine, preferredQuestionId),
    [engine, preferredQuestionId],
  );

  /**
   * Fire the two slow calls for `text`.
   *
   * Split out of submitDescription because a resumed session needs exactly this work re-done
   * for whichever half had not landed when the tab reloaded — same calls, same handlers, so
   * the two paths cannot drift apart.
   *
   * `seedNextQuestion` is off on resume once questions have been answered: the model's
   * suggestion was for the FIRST question, and reintroducing it mid-flow would point the
   * engine back at ground it has already covered.
   */
  const kickOff = useCallback(
    (text: string, opts: { profile: boolean; site: boolean; seedNextQuestion: boolean }) => {
      /* fetchNeoSite never rejects; it falls back to a recorded real response. */
      if (opts.site) fetchNeoSite("", text).then(setNeoSite);

      /* Question wording, in parallel and deliberately not awaited. It only has to land
         before the FIRST question screen, which is a guess-screen read away, so it never
         gates anything the user is looking at. Neither call blocks the other. */
      if (opts.profile) {
        void fetchQuestionSurface(text).then((surface) => {
          if (Object.keys(surface).length === 0) return;
          /**
           * Do not apply it once a question is on screen.
           *
           * Wording lands ~12s in. Someone who taps "That's us" quickly is already reading
           * question 1 in the fixed wording, and applying the override then rewrites the
           * question under them mid-read. Better to lose the generated wording for a fast
           * mover than to change the words they are in the middle of.
           */
          if (stageRef.current === "question" || stageRef.current === "reveal") return;
          setEngine((prev) => ({ ...prev, surface }));
        });
      }
      if (!opts.profile) return;

      setLoading(true);
      setError(null);
      buildProfile(text)
        .then((res) => {
          setSummary(res.profile.summary);
          setReveal(res.reveal);
          if (opts.seedNextQuestion) setPreferredQuestionId(res.nextQuestionId ?? null);
          // Seed the engine with what the free text alone told us. This is why the ring
          // opens partly filled rather than empty.
          setEngine((prev) => ({
            ...prev,
            /* Guess-screen meter line. Question wording comes from fetchQuestionSurface. */
            ...(res.meterGuess ? { meterGuess: res.meterGuess } : {}),
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
    },
    [],
  );

  /**
   * Screen-1 submit. Fires both requests AND advances immediately — they resolve while the
   * user reads the guess and answers questions, so the reveal is already in memory by the
   * time they reach it. Do not await before advancing.
   */
  const submitDescription = useCallback(
    (text: string) => {
      unlockSound();
      playSound("progress");
      setRawText(text);
      setStage("guess");
      kickOff(text, { profile: true, site: true, seedNextQuestion: true });
    },
    [kickOff],
  );

  /**
   * Re-fire whatever was still in flight when the tab reloaded. Guarded by a ref rather than
   * an empty dep array because StrictMode runs effects twice in development, and the guard is
   * the difference between one Neo generation and two.
   */
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    if (!restored?.rawText) return;
    /* Only stages that actually consume the results. Parked on Describe the user is about to
       rewrite the description, so firing a profile and a Neo generation for the text they are
       replacing is pure waste — and Neo's generator is the one call worth not wasting. */
    if (restored.stage !== "guess" && restored.stage !== "question" && restored.stage !== "reveal") {
      return;
    }

    const needProfile = restored.reveal === null;
    const needSite = restored.neoSite === null;
    if (!needProfile && !needSite) return;

    kickOff(restored.rawText, {
      profile: needProfile,
      site: needSite,
      seedNextQuestion: restored.engine.asked.length === 0,
    });
  }, [restored, kickOff]);

  /** Snapshot after every meaningful change, so a reload lands on the current screen. */
  useEffect(() => {
    saveSnapshot({ stage, engine, rawText, reveal, summary, preferredQuestionId, neoSite });
  }, [stage, engine, rawText, reveal, summary, preferredQuestionId, neoSite]);

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
    /* Clear Neo's site too. It was generated from the description they are about to rewrite,
       so keeping it means the reveal can show the PREVIOUS business's site until the new
       generation lands — the same wrong-content failure the 90s timeout exists to avoid. */
    setNeoSite(null);
  }, []);

  const restart = useCallback(() => {
    /* Explicit, because saveSnapshot skips the hook stage: without this the cleared run would
       still be in storage and the next reload would resurrect it. */
    clearSnapshot();
    setStage("hook");
    setEngine(emptyEngine);
    setRawText("");
    setReveal(null);
    setSummary(null);
    setNeoSite(null);
    setPreferredQuestionId(null);
    setError(null);
  }, []);

  const stepNumber = engine.asked.length + 1;
  const screenKey = stage === "question" ? `q-${current?.id ?? "none"}` : stage;

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
            stage={stage}
            lastQuestionId={engine.asked[engine.asked.length - 1] ?? null}
            profile={engine.profile}
            copyContext={{
              surface: engine.surface,
              meterGuess: engine.meterGuess,
              pickedOptionIds: engine.trail?.[engine.trail.length - 1]?.pickedOptionIds,
            }}
          />
        </motion.div>
      </AnimatePresence>

      <main className={`stage${stage === "reveal" ? " stage-reveal" : ""}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={screenKey}
            className={`screen${stage === "reveal" ? " screen-wide" : ""}`}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transition}
          >
            {stage === "hook" && (
              <Hook
                onStart={() => {
                  unlockSound();
                  playSound("start");
                  setStage("describe");
                }}
              />
            )}

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
                  unlockSound();
                  playSound("progress");
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
                mailboxCount={
                  Number(engine.profile.mailboxCount ?? engine.profile.teamSize ?? 0) || null
                }
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
