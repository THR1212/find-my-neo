import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

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
  type RationaleResult,
} from "./lib/api";
import { recommend } from "./lib/rules";
import { fetchNeoSites, type NeoSite } from "./lib/neoSite";
import { clearSnapshot, loadSnapshot, saveSnapshot, type Stage } from "./lib/persist";
import type { RevealContent } from "./lib/session";

import DegradeBanner from "./components/DegradeBanner";
import SoundToggle from "./components/SoundToggle";
import NarrowingMeter from "./components/NarrowingMeter";
import Hook from "./screens/Hook";
import Describe from "./screens/Describe";
import Guess from "./screens/Guess";
import AdaptiveQuestion from "./screens/AdaptiveQuestion";
import Reveal from "./screens/Reveal";
import Checkout from "./screens/Checkout";
import Success from "./screens/Success";
import type { CheckoutOrder } from "./lib/checkout";

const transition = { duration: 0.42, ease: [0.16, 1, 0.3, 1] as const };

/**
 * Entry and exit use DIFFERENT easings, and that is the whole fix.
 *
 * Both used `[0.16, 1, 0.3, 1]` — a strong ease-OUT, right for arriving: most of the change
 * happens immediately, so a screen appears to land. Run it backwards on the way out and the
 * same curve dumps opacity in roughly the first 120ms of a 420ms transition, so the screen
 * you just submitted vanishes and then 300ms of nothing happens. Hari described it as
 * disappearing instantly, which is exactly what an ease-out exit does.
 *
 * The exit now eases IN: it holds, then leaves. Slightly shorter overall, because a slow
 * departure delays the answer they are waiting for.
 */
const EXIT_EASE = [0.4, 0, 1, 1] as const;
const variants = {
  enter: { opacity: 0, y: 18 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -14, transition: { duration: 0.34, ease: EXIT_EASE } },
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
  const [neoSite, setNeoSite] = useState<NeoSite | null>(restored?.neoSite ?? null);
  /**
   * The SECOND generator snapshot, shown beside the first on the email+site reveal.
   *
   * Not a second round-trip in series: `generateNeoSites` classifies once, then generates
   * both templates with `Promise.allSettled` and drops a duplicate `templateKey`, so the pair
   * costs one call's wall-clock. The pair is the point — Neo picks the template randomly
   * client-side (docs/neo-product-facts.md), and showing two is what lets someone choose
   * instead of being assigned one.
   */
  const [neoSiteAlt, setNeoSiteAlt] = useState<NeoSite | null>(restored?.neoSiteAlt ?? null);
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
  const [rationale, setRationale] = useState<RationaleResult>(
    restored?.rationale ?? { rationale: "", whyNotCheaper: "", because: "" },
  );
  /**
   * The model's verified verdict on the plan — the one place a model can change what someone
   * pays. Null until it lands, and null forever if it fails, in which case the deterministic
   * recommendation stands unchanged.
   */
  const [verdict, setVerdict] = useState<PlanVerdict | null>(restored?.verdict ?? null);

  /**
   * The Claim payload: what the reveal was actually showing when they pressed the button.
   *
   * Built in Reveal from the recommendation ON SCREEN, which is the swapped one when they
   * took the cheaper plan — so the checkout bills what they chose, not what we first
   * suggested. Null before Claim, and a checkout stage without one falls back to the reveal
   * on restore (see persist.ts).
   */
  const [checkoutOrder, setCheckoutOrder] = useState<CheckoutOrder | null>(
    restored?.checkoutOrder ?? null,
  );
  /** Guards a double-tap on Pay while the mock settles. */
  const [paying, setPaying] = useState(false);

  /**
   * Current stage, readable from inside async callbacks.
   *
   * `kickOff` closes over the stage at call time, which is always "guess" — so it cannot tell
   * whether the person has since moved on. A ref is the only thing that reads live here.
   */
  const stageRef = useRef<Stage>(stage);
  stageRef.current = stage;

  const conf = useMemo(
    () => confidence(engine.profile, engine.prefilled, engine.prosaic),
    [engine.profile, engine.prefilled, engine.prosaic],
  );
  /* The model's ranking now lives inside `engine` (and so is persisted and overruled there),
     rather than in a separate state that was consumed once and thrown away. */
  const current = useMemo(() => nextQuestion(engine), [engine]);
  /* Read inside the question-surface callback, which fires long after that render. A ref, not
     the value, because the callback closes over whichever render started the fetch. */
  const currentQuestionRef = useRef<string | null>(null);
  currentQuestionRef.current = current?.id ?? null;
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
      /* fetchNeoSites never rejects; it falls back to a recorded real response. */
      if (opts.site) {
        setNeoSiteAlt(null);
        void fetchNeoSites("", text).then((sites) => {
          if (sites[0]) setNeoSite(sites[0]);
          setNeoSiteAlt(sites[1] ?? null);
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
          setEngine((prev) => {
            /**
             * PREFILL MUST NOT OVERWRITE AN ANSWER THEY ALREADY GAVE.
             *
             * `...prefill` last meant the server won. Harmless on a fresh submit, where the
             * profile is empty — but this same call re-fires on RESUME, and the resume path
             * runs at `stage === "question"` whenever there is no reveal yet. So someone who
             * answered three questions and reloaded the tab could have a tap replaced by the
             * model's reading of their description: tap "Just email", reload, and a prefill of
             * `surface: "both"` silently put the site back.
             *
             * Their answers now win. Prefill fills GAPS only, which is all it was ever for —
             * `prefilledQuestionIds` exists to skip questions nobody needs to be asked, not to
             * answer ones already answered.
             */
            const gapsOnly = Object.fromEntries(
              Object.entries(res.prefill ?? {}).filter(([k]) => prev.profile[k] === undefined),
            );
            /* Same reason: a question they have ANSWERED must not be relabelled "you already
               told us", or the guess screen credits the description for their tap. */
            const stillPrefilled = (res.prefilledQuestionIds ?? []).filter(
              (id) => !prev.asked.includes(id),
            );
            return {
            ...prev,
            profile: {
              ...prev.profile,
              industry: res.profile.industry,
              brandName: res.profile.domainStem,
              ...(res.profile.teamSize ? { teamSize: res.profile.teamSize } : {}),
              ...gapsOnly,
            },
            prefilled: stillPrefilled,
            /* Only on a fresh run. Re-seeding a ranking mid-flow would point the engine back
               at ground it has already covered — the ranking was computed before any answer. */
            ...(opts.seedNextQuestion ? { priority: res.questionPriority ?? [] } : {}),
            };
          });
          /**
           * SERIALISED, on Hari's call. It used to fire beside this one.
           *
           * In parallel it could not know which questions mattered, so it rewrote all nine —
           * roughly forty strings — and measured 11.5s, 45s and 62s on identical inputs. A run
           * only ever SHOWS five or six; the rest are prefilled, gated out, or never reached.
           * We were generating about twice what anyone reads, and the wait was proportional
           * to the waste.
           *
           * Starting later costs the profile's own latency. Rewriting half as much should more
           * than pay that back, and the variance matters more than the mean here — the 62s run
           * is what breaks the feature, not the 11s one.
           *
           * Order comes from `questionPriority` minus anything the description already
           * answered: exactly the questions about to appear, in the order they will appear.
           */
          const askOrder = (res.questionPriority ?? []).filter(
            (id) => !(res.prefilledQuestionIds ?? []).includes(id),
          );
          void fetchQuestionSurface(text, askOrder.slice(0, 6)).then((surface) => {
          if (Object.keys(surface).length === 0) return;
          /* Nothing left to reword. */
          if (stageRef.current === "reveal") return;

          /**
           * Apply it to every question EXCEPT the one being read right now.
           *
           * The rule used to be "drop it entirely once a question is on screen", and the
           * reason was right: rewriting a question under someone mid-read is worse than
           * plain wording. But it threw away the other seven to protect one, and it did that
           * more and more often as the call got slower — measured live at 11.5s on one run
           * and past 45s on the next, against a guess screen most people leave in a few
           * seconds. The generated wording was being discarded almost every time.
           *
           * Holding back the current question keeps the original guarantee intact and lets
           * the rest of the flow read as it was meant to.
           */
          setEngine((prev) => {
            const onScreen = stageRef.current === "question" ? currentQuestionRef.current : null;
            if (!onScreen) return { ...prev, surface };
            const rest = { ...surface };
            delete rest[onScreen];
            return { ...prev, surface: rest };
          });
          });

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
    saveSnapshot({ stage, engine, rawText, reveal, summary, neoSite, neoSiteAlt, reasons, rationale, verdict, checkoutOrder });
  }, [stage, engine, rawText, reveal, summary, neoSite, neoSiteAlt, reasons, rationale, verdict, checkoutOrder]);

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
          if (r && (r.rationale || r.whyNotCheaper || r.because)) setRationale(r);
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
    setReasons({});
    setRationale({ rationale: "", whyNotCheaper: "", because: "" });
    setVerdict(null);
    setError(null);
    /* The checkout half too, or the next run's Claim can flash the previous cart before the
       new order is built. `neoSiteAlt` was missed when the second template landed. */
    setCheckoutOrder(null);
    setNeoSiteAlt(null);
    setPaying(false);
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

  const showMeter = stage === "guess" || stage === "question" || stage === "reveal";

  /**
   * Checkout and success are Neo's pages, not ours.
   *
   * They render outside the qualifier's shell so the meter dock and the background blooms are
   * gone — the point of the in-app checkout is that it reads as the thing you were handed to,
   * and our chrome sitting on top of it would undo that.
   */
  const funnel = stage === "checkout" || stage === "success";
  useEffect(() => {
    document.documentElement.classList.toggle("is-funnel", funnel);
    return () => {
      document.documentElement.classList.remove("is-funnel");
    };
  }, [funnel]);
  const stepNumber = engine.asked.length + 1;

  return (
    <>
      <div className="backdrop" aria-hidden="true">
        <div className="bloom bloom-1" />
        <div className="bloom bloom-2" />
        <div className="bloom bloom-3" />
      </div>
      <div className="grain" aria-hidden="true" />

      <AnimatePresence>
        {showMeter && (
          <motion.div
            className="meter-dock"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={transition}
          >
            {/* Words, not a count. The raw "possible setups" number went on Hari's call on
                02 Sep — it read as a made-up statistic to anyone outside the team — and Moin's
                replacement writes a line from the stage and the last answer instead. Merged
                file-level from moin-version; `copyContext` is optional, so the AI-written
                variant on his branch can be wired later without changing this. */}
            <NarrowingMeter
              confidence={conf}
              stage={stage}
              /* The wait screens are the one place the ring cannot move on its own: the
                 profile is in flight, so confidence has nothing to update from. Without this
                 the dock reads as stalled at exactly the moment it is working hardest. */
              busy={loading}
              lastQuestionId={engine.asked[engine.asked.length - 1] ?? null}
              profile={engine.profile}
              /**
               * NO `copyContext`, and this was tried and backed out on 03 Sep.
               *
               * The meter reads the same line for the whole question phase, which looks like
               * something to fix. Passing `pickedOptionIds` does make it vary — into nonsense.
               * `situationFromPicks` wants a per-option `meter` line generated by the server;
               * with none it falls through to `fallbackSituation`, which was written for the
               * NUMBERS meter and returns another audience phrase, so `pairSituation` stacks
               * two of them: "small teams like yours / Clubs like yours" for a bike shop.
               *
               * To turn it on properly, questionService has to emit `meter` per option — the
               * field is already declared on QuestionSurface for exactly this. That is more
               * output on the call that is already the slow one, so it waits until the
               * question rewrite is cheaper. Static and coherent beats varying and garbled.
               */
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Always mounted, never debug-gated: sound ships MUTED and this is the only way to
          turn it on, so it has to be there for the audience and not just for us. */}
      <SoundToggle />

      {/* Dev-only, and the whole point is that it is impossible to miss: every silent fallback
          on screen as it happens. See the header of DegradeBanner. */}
      {debug && <DegradeBanner />}

      {/* Debug-only. Positioned out of the flow so it cannot disturb a screenshot or a demo. */}
      {debug && stage === "reveal" && (
        <button className="btn btn-ghost debug-save" onClick={saveRun}>
          Download this run
        </button>
      )}

      {/* The checkout and success screens are meant to read as NEO's pages, not ours, so they
          render outside the qualifier's shell entirely — no meter dock, no blooms, full bleed.
          `is-funnel` on <html> is what hides the chrome; see index.css. */}
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
              onRestart={restart}
            />
          )}
        </main>
      ) : (
      <>
      {/* `stage-reveal` and `screen-wide` are what the merged split layout hangs off:
          html:has(.stage-reveal) locks the page to the viewport so the reveal is one screen,
          and .screen-wide widens it for the two panes. Without these two class names the
          layout renders but scrolls, which is the thing the split was for. */}
      <main className={`stage${stage === "reveal" ? " stage-reveal" : ""}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={stage === "question" ? `q-${current?.id ?? "none"}` : stage}
            className={`screen${stage === "reveal" ? " screen-wide" : ""}${
              stage === "guess" && loading ? " screen-wait" : ""
            }`}
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
                inferred={inferred}
                loading={loading}
                error={error}
                onConfirm={() => setStage("question")}
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
      </>
      )}
    </>
  );
}
