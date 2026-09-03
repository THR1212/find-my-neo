import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import {
  applyAnswer,
  confidence,
  nextQuestion,
  shouldReveal,
  type EngineState,
} from "./lib/engine";
import { describePrefill } from "./lib/questions";
import { buildRunRecord, postRun, downloadRun, debugEnabled } from "./lib/runLog";
import {
  buildProfile,
  fetchQuestionSurface,
  fetchReasons,
  fetchRationale,
  fetchPlanVerdict,
  type PlanVerdict,
} from "./lib/api";
import { recommend } from "./lib/rules";
import { fetchNeoSites, fixtureFitsDescription, type NeoSite } from "./lib/neoSite";
import { clearSnapshot, loadSnapshot, saveSnapshot, type Stage } from "./lib/persist";
import type { RevealContent } from "./lib/session";

import NarrowingMeter from "./components/NarrowingMeter";
import SetupTray from "./components/SetupTray";
import { playSound, unlockSound } from "./sound";
import Hook from "./screens/Hook";
import Describe from "./screens/Describe";
import Guess from "./screens/Guess";
import AdaptiveQuestion from "./screens/AdaptiveQuestion";
import Reveal from "./screens/Reveal";
import Checkout from "./screens/Checkout";
import Success from "./screens/Success";
import type { CheckoutOrder } from "./lib/checkout";

const EASE = [0.16, 1, 0.3, 1] as const;
const meterTransition = { duration: 0.2, ease: EASE };

/**
 * Hook / describe / reveal stay snappy. Questions used to share that 200ms swap, so each
 * prompt popped in and was gone before it had landed. `mode="wait"` still sequences them —
 * the current question fades out, there is a short hold, then the next one eases in.
 * pointer-events off on enter/exit so a second click cannot land on a screen that is leaving
 * (the outgoing question stays mounted for the whole exit — see DECISIONS.md 2 Sep).
 */
const SNAPPY_SCREEN = {
  enter: { opacity: 0, y: 8, pointerEvents: "none" as const },
  center: {
    opacity: 1,
    y: 0,
    pointerEvents: "auto" as const,
    transition: { duration: 0.22, ease: EASE },
  },
  exit: {
    opacity: 0,
    y: -6,
    pointerEvents: "none" as const,
    transition: { duration: 0.2, ease: EASE },
  },
};

const QUESTION_SCREEN = {
  enter: { opacity: 0, y: 16, pointerEvents: "none" as const },
  center: {
    opacity: 1,
    y: 0,
    pointerEvents: "auto" as const,
    transition: { duration: 0.7, delay: 0.2, ease: EASE },
  },
  exit: {
    opacity: 0,
    y: -14,
    pointerEvents: "none" as const,
    transition: { duration: 0.55, ease: EASE },
  },
};

const INSTANT_SCREEN = {
  enter: { opacity: 1, y: 0 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 1, y: 0 },
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
  const [neoSite, setNeoSite] = useState<NeoSite | null>(() => {
    const restoredSite = restored?.neoSite ?? null;
    if (!restoredSite) return null;
    if (restoredSite.source === "fixture" && !fixtureFitsDescription(restored?.rawText ?? "")) {
      return null;
    }
    return restoredSite;
  });
  const [neoSiteAlt, setNeoSiteAlt] = useState<NeoSite | null>(() => {
    const restoredSite = restored?.neoSiteAlt ?? null;
    if (!restoredSite) return null;
    if (restoredSite.source === "fixture" && !fixtureFitsDescription(restored?.rawText ?? "")) {
      return null;
    }
    return restoredSite;
  });
  /**
   * Model-written "why this matters to you" clauses, by feature id.
   *
   * Needed only at the reveal, so unlike the question surface there is no race to guard: it
   * has 30s+ to land while Neo's generator runs. Empty means every feature line renders its
   * hand-written string.
   */
  const [reasons, setReasons] = useState<Record<string, string>>(restored?.reasons ?? {});
  /**
   * The two sentences under the price, written with the whole run in hand.
   *
   * Empty until the last question is answered, and empty forever if that call fails — the
   * reveal falls back to `buildRationale`, which is why those templates were kept.
   */
  const [rationale, setRationale] = useState<{ rationale: string; whyNotCheaper: string; because: string }>(
    restored?.rationale ?? { rationale: "", whyNotCheaper: "", because: "" },
  );
  /**
   * The model's verified verdict on the plan — the one place a model can change what someone
   * pays. Null until it lands, and null forever if it fails, in which case the deterministic
   * recommendation stands unchanged.
   */
  const [verdict, setVerdict] = useState<PlanVerdict | null>(restored?.verdict ?? null);
  const [checkoutOrder, setCheckoutOrder] = useState<CheckoutOrder | null>(
    restored?.checkoutOrder ?? null,
  );
  const [paying, setPaying] = useState(false);
  /**
   * Options tapped on the question currently on screen, so the meter can react before
   * Continue. Keyed by question id rather than cleared in an effect: an effect would reset it
   * one render AFTER the new question paints, which is a frame of the previous question's
   * copy on the new screen.
   */
  const [livePick, setLivePick] = useState<{ questionId: string | null; ids: string[] }>({
    questionId: null,
    ids: [],
  });

  /**
   * Current stage, readable from inside async callbacks.
   *
   * `kickOff` closes over the stage at call time, which is always "guess" — so it cannot tell
   * whether the person has since moved on. A ref is the only thing that reads live here.
   */
  const stageRef = useRef<Stage>(stage);
  stageRef.current = stage;
  const siteSeq = useRef(0);

  const conf = useMemo(
    () => confidence(engine.profile, engine.prefilled, engine.prosaic),
    [engine.profile, engine.prefilled, engine.prosaic],
  );
  /* The model's ranking now lives inside `engine` (and so is persisted and overruled there),
     rather than in a separate state that was consumed once and thrown away. */
  const current = useMemo(() => nextQuestion(engine), [engine]);
  /* What the description already answered, in the words the option would have used. Shown on
     the guess screen so a skipped question is visible and therefore correctable. */
  const inferred = useMemo(
    () => describePrefill(engine.profile, engine.prefilled, engine.surface),
    [engine.profile, engine.prefilled, engine.surface],
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
      if (opts.site) {
        setNeoSite(null);
        setNeoSiteAlt(null);
        const gen = ++siteSeq.current;
        const bn = text
          .replace(/[^a-zA-Z0-9\s]/g, " ")
          .trim()
          .split(/\s+/)
          .slice(0, 4)
          .join(" ")
          .slice(0, 55);
        void fetchNeoSites(bn, text, "").then((sites) => {
          if (siteSeq.current !== gen) return;
          if (sites[0]) setNeoSite(sites[0]);
          if (sites[1]) setNeoSiteAlt(sites[1]);
        });
      }

      /* Question wording, in parallel and deliberately not awaited. It only has to land
         before the FIRST question screen, which is a guess-screen read away, so it never
         gates anything the user is looking at. Neither call blocks the other. */
      /* Feature reasons. Fired here so it overlaps Neo's generator rather than the questions;
         nothing on screen waits for it. */
      if (opts.profile) {
        void fetchReasons(text).then((r) => {
          if (Object.keys(r).length) setReasons(r);
        });
      }

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
          if (
            stageRef.current === "question" ||
            stageRef.current === "reveal" ||
            stageRef.current === "checkout" ||
            stageRef.current === "success"
          ) {
            return;
          }
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
          /**
           * Seed the engine with what the free text alone told us.
           *
           * `prefill` is the important addition. Before it, only industry/brandName/teamSize
           * were seeded — none of which is a question signal — so every one of the six
           * questions stayed unresolved no matter what someone wrote. Type "we take cake
           * orders over Instagram and need a website" and you were still asked where
           * customers reach you and what needs standing up first. That is the "we're not
           * getting more information" complaint, and this is the line that fixes it.
           *
           * The values are already validated server-side against the same vocabulary the
           * `resolves` payloads use, so a prefilled signal is indistinguishable from a tapped
           * one and `isResolved` skips its question for free.
           */
          setEngine((prev) => ({
            ...prev,
            /* Guess-screen meter line. Question wording comes from fetchQuestionSurface. */
            ...(res.meterGuess ? { meterGuess: res.meterGuess } : {}),
            profile: {
              ...prev.profile,
              industry: res.profile.industry,
              brandName: res.profile.domainStem,
              ...(res.profile.teamSize ? { teamSize: res.profile.teamSize } : {}),
              ...(res.prefill ?? {}),
            },
            prefilled: res.prefilledQuestionIds ?? [],
            /* Only on a fresh run. Re-seeding a ranking mid-flow would point the engine back
               at ground it has already covered — the ranking was computed before any answer. */
            ...(opts.seedNextQuestion ? { priority: res.questionPriority ?? [] } : {}),
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
    if (
      restored.stage !== "guess" &&
      restored.stage !== "question" &&
      restored.stage !== "reveal" &&
      restored.stage !== "checkout" &&
      restored.stage !== "success"
    ) {
      return;
    }

    const siteOk =
      restored.neoSite != null &&
      (restored.neoSite.source !== "fixture" || fixtureFitsDescription(restored.rawText));
    const needProfile = restored.reveal === null;
    const needSite = !siteOk;
    if (!needProfile && !needSite) return;

    kickOff(restored.rawText, {
      profile: needProfile,
      site: needSite,
      seedNextQuestion: restored.engine.asked.length === 0,
    });
  }, [restored, kickOff]);

  /**
   * Post the run record once, on arrival at the reveal.
   *
   * A ref rather than a state flag because StrictMode double-invokes effects in development,
   * and this must post once per run, not twice. Waits for `rationale` so the record carries the
   * generated explanation — it lands a few seconds after the reveal, and a record missing it
   * cannot tell us whether that call worked.
   */
  const postedRun = useRef(false);
  useEffect(() => {
    if (stage !== "reveal" || postedRun.current || !rawText || !reveal) return;
    /* Give the rationale call its moment. If it never lands the record still posts, with the
       empty strings that themselves say the call failed. */
    const timer = setTimeout(() => {
      if (postedRun.current) return;
      postedRun.current = true;
      const rec = recommend(engine.profile, reveal.mailboxes.length);
      void postRun(
        buildRunRecord({
          engine,
          businessText: rawText,
          mode: import.meta.env.VITE_LLM_MODE ?? "replay",
          plan: {
            mailPlan: rec.mailPlan.id,
            sitePlan: rec.sitePlan?.id ?? null,
            mailboxes: rec.mailboxes,
            cycle: rec.cycle,
            monthlyInr: rec.monthlyInr,
          },
          viableSetups: rec.viable.length,
          needs: rec.needs.map((n) => ({ id: n.id, because: n.because, entitlement: n.entitlement })),
          reasons,
          rationale,
          verdict,
        }),
      );
    }, 12000);
    return () => clearTimeout(timer);
  }, [stage, rawText, reveal, engine, reasons, rationale, verdict]);

  /** Snapshot after every meaningful change, so a reload lands on the current screen. */
  useEffect(() => {
    saveSnapshot({
      stage,
      engine,
      rawText,
      reveal,
      summary,
      neoSite,
      neoSiteAlt,
      reasons,
      rationale,
      verdict,
      checkoutOrder,
    });
  }, [stage, engine, rawText, reveal, summary, neoSite, neoSiteAlt, reasons, rationale, verdict, checkoutOrder]);

  const funnel = stage === "checkout" || stage === "success";

  useEffect(() => {
    document.documentElement.classList.toggle("is-reveal", stage === "reveal");
    document.documentElement.classList.toggle("is-funnel", funnel);
    return () => {
      document.documentElement.classList.remove("is-reveal");
      document.documentElement.classList.remove("is-funnel");
    };
  }, [stage, funnel]);

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
      setEngine(next);
      const done = shouldReveal(next);
      setStage(done ? "reveal" : "question");

      /**
       * Last answer in: ask for the explanation, with everything we now know.
       *
       * The only model call fired after screen 1, because it is the only one that needs the
       * answers. It gets ~20s of cover behind Neo's generator, and the reveal renders the
       * fixed rationale until it lands — so nothing waits and nothing is blank.
       *
       * The plan goes in as a FACT. `recommend` has already run here, on the same profile the
       * reveal will use, so the model is told what was chosen and never asked to choose.
       */
      if (done && rawText) {
        const rec = recommend(next.profile, reveal?.mailboxes.length ?? 2);
        const answers = (next.trail ?? []).map((t) => ({
          question: t.prompt,
          /* Free text is the answer when nothing was tapped — and it is the whole reason this
             call exists, since no fixed rule can read it. */
          answer:
            t.options
              .filter((o) => t.pickedOptionIds.includes(o.id))
              .map((o) => o.label)
              .join(", ") || (t.freeText ?? ""),
        }));

        /**
         * Plan first, then the explanation of whatever the plan turned out to be.
         *
         * Sequential on purpose: `/api/rationale` is handed the plan as a FACT, so it must be
         * handed the FINAL one. Explaining a plan the model was about to raise would put a
         * sentence on screen describing a different recommendation from the price above it.
         * Both fit inside Neo's 22-38s generator, so nothing on screen waits.
         */
        void fetchPlanVerdict({
          businessText: rawText,
          answers,
          mailTier: rec.mailPlan.id,
          siteTier: rec.sitePlan?.id ?? "none",
          /* Only questions where an option was actually tapped. A question answered in prose
             is exactly what the model is FOR, so those are deliberately absent. */
          answeredByTap: (next.trail ?? [])
            .filter((t) => t.pickedOptionIds.length > 0)
            .map((t) => t.id),
        }).then((v) => {
          if (v?.raised) setVerdict(v);
          const finalRec = recommend(
            next.profile,
            reveal?.mailboxes.length ?? 2,
            v?.raised ? { mail: v.mailTier, site: v.siteTier } : null,
          );
          return fetchRationale({
            businessText: rawText,
            answers,
            mailPlanId: finalRec.mailPlan.id,
            mailPlanName: finalRec.mailPlan.name,
            sitePlanId: finalRec.sitePlan?.id ?? null,
            sitePlanName: finalRec.sitePlan?.name ?? null,
            mailboxes: finalRec.mailboxes,
          });
        }).then((r) => {
          if (r && (r.rationale || r.whyNotCheaper)) {
            setRationale({
              rationale: r.rationale ?? "",
              whyNotCheaper: r.whyNotCheaper ?? "",
              because: r.because ?? "",
            });
          }
        });
      }
    },
    [engine, rawText, reveal],
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
    setNeoSiteAlt(null);
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
    setNeoSiteAlt(null);
    setReasons({});
    setRationale({ rationale: "", whyNotCheaper: "", because: "" });
    setVerdict(null);
    setCheckoutOrder(null);
    setPaying(false);
    setError(null);
  }, []);

  /**
   * `?debug=1` — hand the whole run over as a file.
   *
   * Not a feature and never shown to a visitor. It is the best bug report anyone can give us:
   * the generated wording, every answer, the plan and every degradation, in one file that can
   * be read rather than reproduced.
   */
  const debug = debugEnabled();
  const saveRun = useCallback(() => {
    if (!reveal) return;
    const rec = recommend(engine.profile, reveal.mailboxes.length);
    downloadRun(
      buildRunRecord({
        engine,
        businessText: rawText,
        mode: import.meta.env.VITE_LLM_MODE ?? "replay",
        plan: {
          mailPlan: rec.mailPlan.id,
          sitePlan: rec.sitePlan?.id ?? null,
          mailboxes: rec.mailboxes,
          cycle: rec.cycle,
          monthlyInr: rec.monthlyInr,
        },
        viableSetups: rec.viable.length,
        needs: rec.needs.map((n) => ({ id: n.id, because: n.because, entitlement: n.entitlement })),
        reasons,
        rationale,
        verdict,
      }),
    );
  }, [engine, rawText, reveal, reasons, rationale, verdict]);

  const stepNumber = engine.asked.length + 1;
  const screenKey = stage === "question" ? `q-${current?.id ?? "none"}` : stage;
  const reduceMotion = useReducedMotion();
  const screenVariants = reduceMotion
    ? INSTANT_SCREEN
    : screenKey.startsWith("q-")
      ? QUESTION_SCREEN
      : SNAPPY_SCREEN;
  const liveOptionIds =
    stage === "question" && livePick.questionId === current?.id ? livePick.ids : [];

  return (
    <>
      <div className="backdrop" aria-hidden="true">
        <div className="bloom bloom-1" />
        <div className="bloom bloom-2" />
        <div className="bloom bloom-3" />
      </div>
      <div className="grain" aria-hidden="true" />

      <AnimatePresence>
        {!funnel && (
        <motion.div
          className="meter-dock"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={meterTransition}
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
              currentQuestionId: stage === "question" ? current?.id ?? null : null,
              liveOptionIds,
            }}
          />
        </motion.div>
        )}
      </AnimatePresence>

      {/* Debug-only. Positioned out of the flow so it cannot disturb a screenshot or a demo. */}
      {debug && stage === "reveal" && (
        <button className="btn btn-ghost debug-save" onClick={saveRun}>
          Download this run
        </button>
      )}

      {funnel ? (
        <main className="stage stage-funnel">
          {stage === "checkout" && (
            <Checkout
              order={checkoutOrder}
              paying={paying}
              onBack={() => setStage("reveal")}
              onPay={() => {
                if (paying) return;
                setPaying(true);
                window.setTimeout(() => {
                  setPaying(false);
                  setStage("success");
                }, 400);
              }}
            />
          )}
          {stage === "success" && (
            <Success
              order={checkoutOrder}
              onBack={() => setStage("checkout")}
            />
          )}
        </main>
      ) : (
      <main className={`stage${stage === "reveal" ? " stage-reveal" : ""}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={screenKey}
            className={`screen${stage === "reveal" ? " screen-wide" : ""}${stage === "guess" && loading ? " screen-wait" : ""}`}
            variants={screenVariants}
            initial="enter"
            animate="center"
            exit="exit"
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
                inferred={inferred}
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
              <>
                <AdaptiveQuestion
                  question={current}
                  step={stepNumber}
                  onAnswer={answer}
                  onPicked={(ids) => setLivePick({ questionId: current.id, ids })}
                />
                <SetupTray profile={engine.profile} />
              </>
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
                neoSite={neoSite}
                neoSiteAlt={neoSiteAlt}
                reasons={reasons}
                rationale={rationale}
                verdict={verdict}
                onRestart={restart}
                onClaim={(order) => {
                  setCheckoutOrder(order);
                  setStage("checkout");
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      )}
    </>
  );
}
