import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import NeoProductLoop from "./NeoProductLoop";
import { MAIL_CLIPS, TEMPLATE_SHOTS } from "../lib/neoMedia";

/**
 * The ~10s after they describe the business, while the profile (and therefore the first
 * questions) is still in flight.
 *
 * Three bouncing dots made that wait feel empty. This uses the same product films and
 * template shots the reveal already vendors — Neo's own output, not a spinner we drew —
 * so the pause is a look at the product instead of a loading gap.
 *
 * Beats stay mounted and fade. Unmounting the <video> on every switch dropped the card
 * to a blank frame while the next file buffered. The sequence loops on purpose: unlike
 * Neo's site-generator loader (which must not loop), we do not know when the profile
 * will land. prefers-reduced-motion holds on the first beat.
 */

const BEAT_MS = 2400;

type Beat =
  | { kind: "film"; id: string }
  | { kind: "templates" };

const BEATS: Beat[] = [
  { kind: "film", id: "invoice_builder" },
  { kind: "templates" },
  { kind: "film", id: "fast_apps" },
  { kind: "film", id: "signature" },
  { kind: "film", id: "bookings" },
];

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
        {BEATS.map((beat, n) => {
          const on = n === i;
          if (beat.kind === "film") {
            const film = clip(beat.id);
            if (!film) return null;
            return (
              <div
                key={film.id}
                className={`product-wait-beat${on ? " on" : ""}`}
                aria-hidden={!on}
              >
                <NeoProductLoop clip={film} variant="hero" active={on} />
              </div>
            );
          }
          return (
            <div
              key="templates"
              className={`product-wait-beat product-wait-templates${on ? " on" : ""}`}
              aria-hidden={!on}
            >
              <div className="product-wait-tpl-pair">
                {TEMPLATE_SHOTS.slice(0, 2).map((shot) => (
                  <figure key={shot.id} className="product-wait-tpl">
                    <div className="neo-site-chrome">
                      <span className="neo-dot" />
                      <span className="neo-dot" />
                      <span className="neo-dot" />
                      <span className="neo-site-title">{shot.label} template</span>
                    </div>
                    <img src={shot.src} alt="" />
                  </figure>
                ))}
              </div>
              <p className="product-wait-caption">
                <span className="neo-loop-name">AI-powered site builder</span>
                <span className="neo-loop-caption">
                  Two looks, the way Neo's generator shows them
                </span>
              </p>
            </div>
          );
        })}
      </div>

      <ol className="product-wait-pips" aria-hidden="true">
        {BEATS.map((b, n) => (
          <li key={b.kind === "film" ? b.id : "templates"} className={n === i ? "on" : ""} />
        ))}
      </ol>
    </aside>
  );
}
