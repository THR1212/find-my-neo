import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import type { Question } from "../lib/questions";
import { LineIn, ScreenIn } from "../components/ScreenIn";

/**
 * One question, whichever the engine chose.
 *
 * Two things here are deliberate and worth not undoing:
 *
 * **Multi-select where the world is multi-select.** People genuinely take orders on Instagram
 * *and* over the phone, and genuinely use Gmail *and* Outlook. Forcing one answer gives a
 * tidier dataset and a worse profile. `question.multi` decides per question — headcount and
 * mail-vs-site stay single, because those options really are exclusive.
 *
 * **A free-text box on most questions.** Neo's own persona survey has "Others (free text)" on
 * its multi-selects, and that is where the interesting answers live. It is also the only place
 * after screen 1 where someone can tell us something we didn't think to ask.
 *
 * The "why we're asking" subline matters more than it looks: it is the difference between a
 * form interrogating someone and a tool reasoning out loud.
 */
export default function AdaptiveQuestion({
  question,
  step,
  onAnswer,
}: {
  question: Question;
  step: number;
  onAnswer: (questionId: string, optionIds: string[], freeText?: string) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");

  const multi = question.multi === true;

  function choose(optionId: string) {
    if (!multi) {
      // Single-select keeps the old one-tap feel — no Continue button needed.
      onAnswer(question.id, [optionId], text.trim() || undefined);
      return;
    }
    setPicked((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId],
    );
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    // Free text alone is a valid answer — the engine treats it as resolving the signal.
    if (picked.length === 0 && !text.trim()) return;
    onAnswer(question.id, picked, text.trim() || undefined);
  }

  const canContinue = picked.length > 0 || text.trim().length > 0;

  return (
    <form onSubmit={submit} key={question.id}>
      <ScreenIn>
        <LineIn>
          <p className="eyebrow">Question {step}</p>
        </LineIn>
        <LineIn>
          <h1>{question.prompt}</h1>
        </LineIn>
        {question.sub && (
          <LineIn>
            <p className="lede">{question.sub}</p>
          </LineIn>
        )}

        <LineIn>
          <div className="options" role={multi ? "group" : undefined}>
            {question.options.map((opt, i) => {
              const on = picked.includes(opt.id);
              return (
                <motion.button
                  key={opt.id}
                  type="button"
                  className={`option${on ? " option-on" : ""}`}
                  onClick={() => choose(opt.id)}
                  aria-pressed={multi ? on : undefined}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i, duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                >
                  {multi && (
                    <span className="option-check" aria-hidden="true">
                      {on ? "✓" : ""}
                    </span>
                  )}
                  <span className="option-body">
                    {opt.label}
                    {opt.hint && <span className="option-hint">{opt.hint}</span>}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </LineIn>

        {question.freeText && (
          <LineIn>
            <input
              className="field field-inline"
              type="text"
              value={text}
              placeholder={question.freeText.placeholder}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </LineIn>
        )}

        {(multi || question.freeText) && (
          <LineIn className="row">
            <button className="btn" type="submit" disabled={!canContinue}>
              Continue
            </button>
            <span className="hint">
              {multi
                ? picked.length
                  ? `${picked.length} selected`
                  : "Pick as many as apply"
                : "Or just tell us"}
            </span>
          </LineIn>
        )}
      </ScreenIn>
    </form>
  );
}
