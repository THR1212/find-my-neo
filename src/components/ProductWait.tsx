import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import NeoProductLoop from "./NeoProductLoop";
import { WAIT_CLIPS } from "../lib/neoMedia";

/**
 * The ~10s after they describe the business, while the profile (and therefore the first
 * questions) is still in flight.
 *
 * Three bouncing dots made that wait feel empty. This loops Neo's own product films so
 * the pause is a look at the product. One beat per category the lede names — mail, a site,
 * inbox tools — not four overlapping mail films. Marketing-reel shots of other businesses
 * stay off this screen: those are not this person's generated site.
 *
 * Beats stay mounted and fade. The sequence loops on purpose: unlike Neo's site-generator
 * loader (which must not loop), we do not know when the profile will land.
 * prefers-reduced-motion holds on the first beat.
 *
 * THIS SCREEN OWNS WHEN IT LEAVES, and that is the point of `settled`/`onDone`.
 *
 * It used to be unmounted the instant `loading` flipped in Guess.tsx, which meant the profile
 * landing mid-sentence tore the pane away while someone was still reading it — the one piece
 * of feedback this screen got. The parent cannot fix that, because the parent does not know
 * where the beat clock is. So the parent now says only "the data is here" (`settled`) and this
 * component answers "you may go" (`onDone`) at its own next beat boundary.
 *
 * Deliberately a boundary latch and NOT a minimum dwell of several beats. The complaint was
 * being interrupted, not being shown too little: finishing the beat in progress fixes it, and
 * costs at most one beat. A floor of two or three beats would add multiple seconds of dead
 * air whenever the profile lands quickly, which is a worse screen, not a better one.
 */

/** 2800, down from 3200: ~12% quicker, so a full three-beat cycle fits in 8.4s. */
const BEAT_MS = 2800;

export default function ProductWait({
  /** The thing we were waiting for has arrived. Does NOT dismiss the screen by itself. */
  settled = false,
  /** Called once, at the first beat boundary at or after `settled`. */
  onDone,
}: {
  settled?: boolean;
  onDone?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [i, setI] = useState(0);
  const fired = useRef(false);

  /* Lazy state initialiser rather than a ref written during render: it is evaluated exactly
     once per mount, which is what a start time needs, and unlike a ref assignment it is a
     pure render. The beat clock and the release timer both measure from it, so it has to be
     fixed at mount and not one paint late. */
  const [origin] = useState(() => Date.now());

  /* Held in a ref so a new closure from the parent cannot restart the release timer — that
     would re-arm the wait every time Guess re-rendered, which is a hang, not a delay.
     Assigned in an effect, and this effect is declared BEFORE the release effect on purpose:
     effects run in declaration order, so the ref is current by the time the timer is armed. */
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (reduceMotion) return;
    const t = setInterval(() => {
      const n = Math.floor((Date.now() - origin) / BEAT_MS) % WAIT_CLIPS.length;
      setI((cur) => (cur === n ? cur : n));
    }, 200);
    return () => clearInterval(t);
  }, [reduceMotion, origin]);

  /* Release at a beat boundary, never mid-beat. */
  useEffect(() => {
    if (!settled || fired.current) return;

    const release = () => {
      if (fired.current) return;
      fired.current = true;
      doneRef.current?.();
    };

    /* Reduced motion holds on beat one and never animates, so there is no beat to finish and
       nothing to interrupt. Holding someone there would be delay for its own sake. */
    if (reduceMotion) {
      release();
      return;
    }

    const elapsed = Date.now() - origin;
    /* The next boundary — and never less than one whole beat, so a profile that resolves
       almost instantly still shows one complete pane rather than a flash. */
    const target = Math.max(BEAT_MS, Math.ceil(elapsed / BEAT_MS) * BEAT_MS);
    const t = setTimeout(release, Math.max(0, target - elapsed));
    return () => clearTimeout(t);
  }, [settled, reduceMotion, origin]);

  return (
    <aside className="product-wait" aria-busy="true" aria-live="polite">
      <p className="eyebrow">Putting this together</p>
      <h1>Here is what Neo can wrap around that</h1>
      <p className="lede">
        Mail, a site, the tools that live in the inbox. A few questions next — this usually
        takes a few seconds.
      </p>

      <div className="product-wait-stage">
        {WAIT_CLIPS.map((film, n) => {
          const on = n === i;
          return (
            <div
              key={film.id}
              className={`product-wait-beat${on ? " on" : ""}`}
              aria-hidden={!on}
            >
              <NeoProductLoop clip={film} variant="hero" active={on} />
            </div>
          );
        })}
      </div>

      <ol className="product-wait-pips" aria-hidden="true">
        {WAIT_CLIPS.map((film, n) => (
          <li key={film.id} className={n === i ? "on" : ""} />
        ))}
      </ol>
    </aside>
  );
}
