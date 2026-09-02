import { motion } from "framer-motion";
import { LineIn, ScreenIn } from "../components/ScreenIn";

/**
 * The guess. The first of two moments carrying the pitch — the tool reflects the business
 * back and the user thinks "how did it know that".
 *
 * It is also where the profile request lands. If it hasn't resolved we hold here rather than
 * showing an empty guess: waiting to be *read* is different from waiting to be shown something.
 */
export default function Guess({
  summary,
  teamSize,
  loading,
  error,
  onConfirm,
  onReject,
}: {
  summary: string | null;
  teamSize?: number;
  loading: boolean;
  error: string | null;
  onConfirm: () => void;
  onReject: () => void;
}) {
  if (error) {
    return (
      <ScreenIn>
        <LineIn>
          <p className="eyebrow">Something broke</p>
        </LineIn>
        <LineIn>
          <h1>We couldn't read that.</h1>
        </LineIn>
        <LineIn>
          <p className="lede">{error}</p>
        </LineIn>
        <LineIn>
          <button className="btn" onClick={onReject}>
            Try again
          </button>
        </LineIn>
      </ScreenIn>
    );
  }

  if (loading) {
    return (
      <ScreenIn>
        <LineIn>
          <p className="eyebrow">Reading that back</p>
        </LineIn>
        <LineIn>
          <h1 style={{ color: "var(--text-faint)" }}>Working it out…</h1>
        </LineIn>
        <LineIn>
          <div className="dots" aria-label="Loading">
            <i />
            <i />
            <i />
          </div>
        </LineIn>
      </ScreenIn>
    );
  }

  /**
   * Resolved, but with nothing to say.
   *
   * This is the degraded path: `api/profile` returns `degraded: true` with an empty summary
   * when the model call fails, precisely so the flow can continue (CLAUDE.md rule 4). The
   * condition used to be folded into `loading || !summary`, which turned "we could not read
   * it" into a spinner that never resolved — the exact opposite of degrading gracefully, and
   * silent, because a degraded response is a perfectly good HTTP 200.
   *
   * So: say so, and keep both doors open. The questions still work without a summary — the
   * engine simply asks more of them, which is the right behaviour when we know less.
   */
  if (!summary) {
    return (
      <div>
        <p className="eyebrow">Reading that back</p>
        <h1>We didn't catch enough to guess.</h1>
        <p className="lede">
          The questions will get us there instead — there are only a few.
        </p>
        <div className="row">
          <button className="btn" onClick={onConfirm} autoFocus>
            Keep going
          </button>
          <button className="btn btn-ghost" onClick={onReject}>
            Rewrite it
          </button>
        </div>
      </div>
    );
  }

  return (
    <ScreenIn>
      <LineIn>
        <p className="eyebrow">Here's what we think</p>
      </LineIn>
      <LineIn>
        <h1>
          You're{" "}
          <motion.span
            initial={{ opacity: 0, filter: "blur(8px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="guess-highlight"
          >
            {summary}
          </motion.span>
          .
        </h1>
      </LineIn>
      <LineIn>
        <p className="lede">
          {teamSize === 1 ? "Just you, for now." : teamSize ? `A team of ${teamSize}.` : ""} A
          few quick questions and we'll have your setup.
        </p>
      </LineIn>
      <LineIn className="row">
        <button className="btn" onClick={onConfirm} autoFocus>
          That's us
        </button>
        <button className="btn btn-ghost" onClick={onReject}>
          Not quite
        </button>
      </LineIn>
    </ScreenIn>
  );
}
