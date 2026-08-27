import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import {
  initialSession,
  nextScreen,
  SCREEN_ORDER,
  type ImportChoice,
  type SessionState,
  type SurfaceChoice,
} from "./lib/session";
import { buildProfile } from "./lib/api";

import Hook from "./screens/Hook";
import Describe from "./screens/Describe";
import Guess from "./screens/Guess";
import ImportQuestion from "./screens/Import";
import Surface from "./screens/Surface";
import Reveal from "./screens/Reveal";

const transition = { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const };

const variants = {
  enter: { opacity: 0, y: 18 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -14 },
};

export default function App() {
  const [s, setS] = useState<SessionState>(initialSession);

  const advance = useCallback(() => {
    setS((prev) => ({ ...prev, screen: nextScreen(prev.screen) }));
  }, []);

  /**
   * Screen-1 submit. Fires the profile request AND advances immediately — the request
   * resolves underneath while the user reads the guess and taps screens 3-4. This is the
   * whole latency strategy; do not await before advancing.
   */
  const submitDescription = useCallback((text: string) => {
    setS((prev) => ({
      ...prev,
      rawBusinessText: text,
      loading: true,
      error: null,
      screen: nextScreen(prev.screen),
    }));

    buildProfile(text)
      .then(({ profile, reveal }) =>
        setS((prev) => ({ ...prev, profile, reveal, loading: false })),
      )
      .catch((err: unknown) =>
        setS((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        })),
      );
  }, []);

  const chooseImport = useCallback((choice: ImportChoice) => {
    setS((prev) => ({ ...prev, importChoice: choice, screen: nextScreen(prev.screen) }));
  }, []);

  const chooseSurface = useCallback((choice: SurfaceChoice) => {
    setS((prev) => ({ ...prev, surfaceChoice: choice, screen: nextScreen(prev.screen) }));
  }, []);

  const restart = useCallback(() => setS(initialSession), []);

  const stepIndex = SCREEN_ORDER.indexOf(s.screen);

  return (
    <>
      <div className="backdrop" aria-hidden="true">
        <div className="bloom bloom-1" />
        <div className="bloom bloom-2" />
        <div className="bloom bloom-3" />
      </div>
      <div className="grain" aria-hidden="true" />

      {s.screen !== "hook" && (
        <div className="progress" aria-hidden="true">
          {SCREEN_ORDER.slice(1).map((id, i) => (
            <i key={id} className={i <= stepIndex - 1 ? "on" : ""} />
          ))}
        </div>
      )}

      <main className="stage">
        <AnimatePresence mode="wait">
          <motion.div
            key={s.screen}
            className="screen"
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transition}
          >
            {s.screen === "hook" && <Hook onStart={advance} />}
            {s.screen === "describe" && <Describe onSubmit={submitDescription} />}
            {s.screen === "guess" && (
              <Guess
                profile={s.profile}
                loading={s.loading}
                error={s.error}
                onConfirm={advance}
              />
            )}
            {s.screen === "import" && <ImportQuestion onChoose={chooseImport} />}
            {s.screen === "surface" && <Surface onChoose={chooseSurface} />}
            {s.screen === "reveal" && (
              <Reveal
                reveal={s.reveal}
                loading={s.loading}
                error={s.error}
                surface={s.surfaceChoice}
                onRestart={restart}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </>
  );
}
