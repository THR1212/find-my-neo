import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { NeoClip } from "../lib/neoMedia";

/**
 * One of Neo's own product films, looping silently.
 *
 * `muted` + `playsInline` are load-bearing, not decoration: without both, iOS Safari and
 * Chrome's autoplay policy refuse to start the video and the card sits on a black frame.
 * `preload="none"` until it is on screen keeps three of these off the critical path.
 *
 * Honours prefers-reduced-motion by not autoplaying — a looping video is exactly the kind of
 * thing that setting exists for.
 */
export default function NeoProductLoop({
  clip,
  active = true,
  variant = "row",
}: {
  clip: NeoClip;
  active?: boolean;
  /** `hero` is the wait-screen treatment: film on top, name underneath. */
  variant?: "row" | "hero";
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduceMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active && !reduceMotion) {
      /* Autoplay can still be refused (low power mode). A rejected promise here is not an
         error worth surfacing — the poster frame is a perfectly good still. */
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [active, reduceMotion]);

  /**
   * A failed video keeps its caption. It used to `return null`, which is how three loading
   * panes become an empty screen with no explanation — the exact silent-failure shape this
   * project keeps finding. On 04 Sep every clip 302'd to a login page (Deployment Protection
   * on the aliased host), and the visible symptom was "it goes blank", with nothing on screen
   * or in the console to say a video had been refused.
   *
   * The frame collapses and the name and caption stay, so the pane still says what Neo does
   * even when the footage cannot load.
   */
  return (
    <motion.figure
      className={`neo-loop${variant === "hero" ? " neo-loop-hero" : ""}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      {failed ? null : (
      <div className="neo-loop-frame">
        <video
          ref={ref}
          src={clip.src}
          loop
          muted
          playsInline
          preload={variant === "hero" ? "auto" : "metadata"}
          controls={false}
          onError={() => setFailed(true)}
        />
      </div>
      )}
      <figcaption>
        {clip.kicker ? <span className="neo-loop-kicker">{clip.kicker}</span> : null}
        <span className="neo-loop-name">{clip.name}</span>
        <span className="neo-loop-caption">{clip.caption}</span>
      </figcaption>
    </motion.figure>
  );
}
