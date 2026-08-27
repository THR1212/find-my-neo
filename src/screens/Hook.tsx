import { HOOK_COPY, PRODUCT_NAME } from "../lib/brand";

/**
 * The entry point. On the real pricing page this is a small inline prompt that opens a
 * full-screen overlay — it deliberately does NOT replace the pricing page, so users who
 * already know what they want are never blocked and the script can fail gracefully.
 * Here it stands alone as the demo's opening frame.
 */
export default function Hook({ onStart }: { onStart: () => void }) {
  return (
    <div>
      <p className="eyebrow">{PRODUCT_NAME}</p>
      <h1>{HOOK_COPY}</h1>
      <p className="lede">
        Tell us what you do. We'll find your domain, set up your mailboxes, and draft your
        site — before you pay for anything.
      </p>
      <div className="row">
        <button className="btn" onClick={onStart} autoFocus>
          Start
        </button>
        <span className="hint">Takes about a minute</span>
      </div>
    </div>
  );
}
