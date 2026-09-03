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
 */

const BEAT_MS = 3200;

export default function ProductWait() {
  const reduceMotion = useReducedMotion();
  const [i, setI] = useState(0);
  const origin = useRef<number | null>(null);

  useEffect(() => {
    if (reduceMotion) return;
    if (origin.current == null) origin.current = Date.now();
    const t = setInterval(() => {
      const started = origin.current;
      if (started == null) return;
      const n = Math.floor((Date.now() - started) / BEAT_MS) % WAIT_CLIPS.length;
      setI((cur) => (cur === n ? cur : n));
    }, 200);
    return () => clearInterval(t);
  }, [reduceMotion]);

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
