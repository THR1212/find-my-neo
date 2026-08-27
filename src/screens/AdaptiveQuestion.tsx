import { motion } from "framer-motion";
import type { Question } from "../lib/questions";

/**
 * One question, whichever the engine chose. Replaces the old fixed Import/Surface screens.
 *
 * The "why we're asking" line matters more than it looks: it is the difference between a
 * form interrogating you and a tool reasoning out loud. It is also where the retention
 * evidence surfaces to the user without becoming a statistics lesson.
 */
export default function AdaptiveQuestion({
  question,
  step,
  onAnswer,
}: {
  question: Question;
  step: number;
  onAnswer: (questionId: string, optionId: string) => void;
}) {
  return (
    <div key={question.id}>
      {/* No "of N" — the engine stops early when it's confident, so a denominator would be
          a promise we might not keep. The narrowing meter already shows progress, and it
          shows something more interesting than a count. */}
      <p className="eyebrow">Question {step}</p>
      <h1>{question.prompt}</h1>
      {question.sub && <p className="lede">{question.sub}</p>}

      <div className="options">
        {question.options.map((opt, i) => (
          <motion.button
            key={opt.id}
            className="option"
            onClick={() => onAnswer(question.id, opt.id)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          >
            {opt.label}
            {opt.hint && <span className="option-hint">{opt.hint}</span>}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
