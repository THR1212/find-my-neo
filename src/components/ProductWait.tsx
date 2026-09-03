import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import NeoProductLoop from "./NeoProductLoop";
import { MAIL_CLIPS } from "../lib/neoMedia";

/**
 * The ~10s after they describe the business, while the profile (and therefore the first
 * questions) is still in flight.
 *
 * Three bouncing dots made that wait feel empty. This loops Neo's own product films so
 * the pause is a look at the product. Marketing-reel shots of other businesses stay off
 * this screen — those are not this person's generated site.
 *
 * Beats stay mounted and fade. The sequence loops on purpose: unlike Neo's site-generator
 * loader (which must not loop), we do not know when the profile will land.
 * prefers-reduced-motion holds on the first beat.
 */

const BEAT_MS = 2400;

const BEATS = ["invoice_builder", "fast_apps", "signature", "bookings"] as const;

function clip(id: string) {
  return MAIL_CLIPS.find((c) => c.id === id) ?? null;
}

export default function ProductWait() {
  const reduceMotion = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const t = setInterval(() => setI((n) => (n + 1) % BEATS.length), BEAT_MS);
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
        {BEATS.map((id, n) => {
          const film = clip(id);
          if (!film) return null;
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
        {BEATS.map((id, n) => (
          <li key={id} className={n === i ? "on" : ""} />
        ))}
      </ol>
    </aside>
  );
}
