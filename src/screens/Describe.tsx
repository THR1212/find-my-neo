import { useState, type FormEvent } from "react";

/**
 * Screen 1. The only real input in the whole flow, and the thing that justifies using an
 * LLM at all — free text is the point. Everything downstream is refinement.
 *
 * The placeholder is doing real work: it teaches the shape of a good answer without a
 * paragraph of instructions, and it nudges toward the detail the model needs (what you
 * make, how many of you, where).
 */
export default function Describe({
  onSubmit,
  initialText = "",
}: {
  onSubmit: (text: string) => void;
  /** Populated when someone comes back via "Not quite" — they edit rather than retype. */
  initialText?: string;
}) {
  const [text, setText] = useState(initialText);
  const ready = text.trim().length > 12;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (ready) onSubmit(text.trim());
  }

  return (
    <form onSubmit={submit}>
      <p className="eyebrow">First, the only question that matters</p>
      <h1>What's your business?</h1>
      <p className="lede">
        In your own words. The messier the better — we're reading for what you actually do.
      </p>

      <textarea
        className="field"
        rows={4}
        value={text}
        autoFocus
        placeholder="We're a two-person bakery in Bandra called Proof &amp; Butter — custom celebration cakes, and right now every order comes through Instagram DMs."
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter submits; Shift+Enter for a newline. A one-line answer is fine here.
          if (e.key === "Enter" && !e.shiftKey) submit(e);
        }}
      />

      <div className="row">
        <button className="btn" type="submit" disabled={!ready}>
          Continue
        </button>
        <span className="hint">
          {ready ? "Press Enter" : "A sentence or two is plenty"}
        </span>
      </div>
    </form>
  );
}
