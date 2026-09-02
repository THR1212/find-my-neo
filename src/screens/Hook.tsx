import { HOOK_COPY } from "../lib/brand";
import Wordmark from "../components/Wordmark";
import { LineIn, ScreenIn } from "../components/ScreenIn";

/**
 * The entry point. On the real pricing page this is a small inline prompt that opens a
 * full-screen overlay — it deliberately does NOT replace the pricing page, so users who
 * already know what they want are never blocked and the script can fail gracefully.
 * Here it stands alone as the demo's opening frame.
 */
export default function Hook({ onStart }: { onStart: () => void }) {
  return (
    <ScreenIn>
      <LineIn>
        <Wordmark />
      </LineIn>
      <LineIn>
        <h1>{HOOK_COPY}</h1>
      </LineIn>
      <LineIn>
        <p className="lede">
          Tell us what you do. We'll find your domain, set up your mailboxes, and draft your
          site — before you pay for anything.
        </p>
      </LineIn>
      <LineIn className="row">
        <button className="btn" onClick={onStart} autoFocus>
          Start
        </button>
        <span className="hint">Takes about a minute</span>
      </LineIn>
    </ScreenIn>
  );
}
