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

  if (loading || !summary) {
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
