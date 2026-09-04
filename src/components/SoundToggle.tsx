import { useState } from "react";

import { setSoundMuted, soundIsMuted } from "../sound";

/**
 * The visible sound control. It did not exist until 03 Sep.
 *
 * `setSoundMuted` was written, exported, and never called from anywhere — so the cues played
 * with no way to stop them, and `unlockSound()` re-enabled them on every option tap. The plan
 * called muted-by-default plus a visible toggle "non-negotiable, a quiet room will punish
 * you", and the failure mode is that you find out during the pitch.
 *
 * Deliberately always mounted, not debug-gated: this is the control a person in the audience
 * needs, not a developer aid. Small and quiet, because it is not part of the flow.
 */
export default function SoundToggle() {
  const [muted, setMuted] = useState(() => soundIsMuted());

  return (
    <button
      type="button"
      className="sound-toggle"
      aria-pressed={!muted}
      title={muted ? "Sound off — turn on" : "Sound on — turn off"}
      onClick={() => {
        const next = !muted;
        setSoundMuted(next);
        setMuted(next);
      }}
    >
      <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
      <span className="sound-toggle-label">{muted ? "Sound off" : "Sound on"}</span>
    </button>
  );
}
