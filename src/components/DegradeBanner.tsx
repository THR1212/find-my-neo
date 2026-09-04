import { useEffect, useState } from "react";

import { collectedDegradations, onDegraded } from "../lib/errorLog";

/**
 * Dev-only. Every silent fallback, on screen, as it happens.
 *
 * WHY THIS EXISTS. Two failures cost most of 03 Sep, and neither showed anything anywhere:
 *
 *   - `/api/questions` timed out at 20s, retried, gave up at 40s. The handler returns an empty
 *     surface on any failure, every question rendered from the fixed bank, and the only symptom
 *     was that the flow "looked templated".
 *   - `nextQuestion` honoured the model's ranking and never ran `discrimination`. The flow
 *     still asked questions and still priced a plan. It had just stopped being adaptive.
 *
 * Both are *correct* degradations by CLAUDE.md rule 4 — a screen must never know which path it
 * got, and an empty surface is a complete answer. That rule is about the USER's experience.
 * Applied to the developer it produces a flow that lies by omission, and the fix is not to make
 * the runtime noisier but to make the fallbacks visible on the machine where you can act on it.
 *
 * Hidden entirely unless `debugEnabled()` — which is on by default on localhost and off
 * everywhere else, so this can never reach a demo.
 */
export default function DegradeBanner() {
  const [items, setItems] = useState(() => collectedDegradations());
  const [open, setOpen] = useState(true);

  useEffect(() => onDegraded(setItems), []);

  if (items.length === 0) return null;

  return (
    <div className={`degrade-banner${open ? "" : " degrade-banner-closed"}`} role="status">
      <button
        type="button"
        className="degrade-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {items.length} silent fallback{items.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="degrade-list">
          {items.map((d) => (
            <li key={`${d.what}-${d.at}`}>
              <strong>{d.what}</strong>
              {d.detail ? <span> — {d.detail}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
