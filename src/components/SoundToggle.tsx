import { playSound, setSoundMuted, soundIsMuted } from "../sound";
import { useState } from "react";

/**
 * Always visible. Off until someone asks for sound — a quiet room is the demo, not the cue.
 */
export default function SoundToggle() {
  const [muted, setMuted] = useState(soundIsMuted);

  function toggle() {
    const next = !muted;
    setSoundMuted(next);
    setMuted(next);
    if (!next) playSound("advance");
  }

  return (
    <button
      type="button"
      className={`sound-toggle${muted ? "" : " is-on"}`}
      aria-pressed={!muted}
      aria-label={muted ? "Sound is off. Turn on." : "Sound is on. Turn off."}
      onClick={toggle}
    >
      {muted ? "Sound off" : "Sound on"}
    </button>
  );
}
