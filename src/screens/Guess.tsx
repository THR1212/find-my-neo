import { motion } from "framer-motion";
import type { Profile } from "../lib/session";

/**
 * Screen 2 — the guess. This is the first of the two moments that carry the pitch:
 * the tool reflects the business back and the user thinks "how did it know that".
 *
 * It is also where the profile request lands. If it hasn't resolved yet we hold here
 * rather than pushing an empty guess — this is the only screen allowed to wait, because
 * waiting to be read is different from waiting to be shown something.
 */
export default function Guess({
  profile,
  loading,
  error,
  onConfirm,
}: {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  if (error) {
    return (
      <div>
        <p className="eyebrow">Something broke</p>
        <h1>We couldn't read that.</h1>
        <p className="lede">{error}</p>
        <button className="btn" onClick={onConfirm}>
          Carry on anyway
        </button>
      </div>
    );
  }

  if (loading || !profile) {
    return (
      <div>
        <p className="eyebrow">Reading that back</p>
        <h1 style={{ color: "var(--text-faint)" }}>Working it out…</h1>
        <div className="dots" aria-label="Loading">
          <i />
          <i />
          <i />
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">Here's what we think</p>
      <h1>
        You're{" "}
        <motion.span
          initial={{ opacity: 0, filter: "blur(8px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          style={{ color: "var(--accent-warm)" }}
        >
          {profile.summary}
        </motion.span>
        .
      </h1>
      <p className="lede">
        {profile.teamSize === 1
          ? "Just you, for now."
          : `A team of ${profile.teamSize}.`}{" "}
        {profile.location ? `Based in ${profile.location}.` : ""} We'll tune the rest around
        that.
      </p>

      <div className="row">
        <button className="btn" onClick={onConfirm} autoFocus>
          That's us
        </button>
        <button className="btn btn-ghost" onClick={onConfirm}>
          Not quite
        </button>
      </div>
      <p className="hint" style={{ marginTop: 14 }}>
        {/* "Not quite" would reopen the text box in the real build. For the demo both
            paths continue — the branch is narrated, not clicked. */}
        Two more questions after this.
      </p>
    </div>
  );
}
