import { motion } from "framer-motion";
import { LineIn, ScreenIn } from "../components/ScreenIn";
import ProductWait from "../components/ProductWait";

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
  inferred,
  loading,
  error,
  onConfirm,
  onReject,
}: {
  summary: string | null;
  teamSize?: number;
  /**
   * Plain-English lines for the signals the description already answered, so a question can be
   * skipped without the skip being invisible.
   *
   * This screen is the only place a prefill is correctable. `prefill` puts an answer the person
   * never tapped into a profile that decides their plan and their price, and it does it by
   * making a question disappear — so if we show nothing, a wrong inference is both unseen and
   * unfixable. Showing it here keeps "Not quite" a real escape rather than a decorative button.
   */
  inferred?: string[];
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
        <ProductWait />
      </ScreenIn>
    );
  }

  /**
   * Resolved, but with nothing to say.
   *
   * Last resort. `derivedProfile` / `derivedFallback` now write a guess from the user's own
   * words, so this should only fire if they typed nothing usable. The condition used to be
   * folded into `loading || !summary`, which turned a blank summary into a spinner that
   * never resolved.
   *
   * Keep both doors open. The questions still work without a summary — the engine simply
   * asks more of them.
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
      <h1>
        You're{" "}
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="guess-highlight"
        >
          {summary}
        </motion.span>
        .
      </h1>
      <p className="lede">
        {teamSize === 1 ? "Just you, for now." : teamSize ? `A team of ${teamSize}.` : ""} A
        few quick questions and we'll have your setup.
      </p>

      {/* What we already took from the description, and therefore will not ask about. Framed
          as "so we won't ask" because that is the actual consequence to them — and it is the
          reason to speak up now if any of it is wrong. */}
      {inferred && inferred.length > 0 && (
        <motion.div
          className="inferred"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="inferred-label">You already told us, so we won't ask:</p>
          <ul className="inferred-list">
            {inferred.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </motion.div>
      )}

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
