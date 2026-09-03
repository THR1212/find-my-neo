/**
 * Short original cues. Success on the last page is the committed MP3 — do not replace it.
 * Autoplay policies still require a gesture before the context runs; the first tap unlocks.
 */

export type SoundCue = "start" | "select" | "progress" | "cta" | "curious" | "mcq" | "social" | "setup";

/**
 * MUTED BY DEFAULT, and this was shipping the other way round.
 *
 * The plan's wording is "muted by default + visible toggle — non-negotiable, a quiet room
 * will punish you." What was actually here: `muted = false`, `unlockSound()` forcing
 * `muted = false` on every option tap, and `setSoundMuted` exported and never called — so the
 * app played on first use, kept re-unmuting itself, and had no control anywhere. A pitch in a
 * silent room would have been the first time anyone found out.
 *
 * The choice persists: someone who turns sound on should not have to do it again after a
 * reload, and someone who turns it off must not have it come back.
 */
const STORAGE_KEY = "fmn-sound";

function initialMuted(): boolean {
  try {
    /* Only an explicit "on" unmutes. A cleared store, a private window, or a browser that
       throws on storage all fall through to silence — the safe direction. */
    return localStorage.getItem(STORAGE_KEY) !== "on";
  } catch {
    return true;
  }
}

let muted = initialMuted();
let ctx: AudioContext | null = null;
let successClip: HTMLAudioElement | null = null;
let lastCueAt = 0;
let lastCue: string | null = null;

export function soundIsMuted() {
  return muted;
}

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/**
 * Unlock the AUDIO CONTEXT, never the mute setting.
 *
 * Browsers require a user gesture before an AudioContext will run, so this has to be called
 * from a click — but it used to set `muted = false` at the same time, which meant every option
 * tap silently re-enabled sound the person may have just turned off. Unlocking and unmuting
 * are different things and only one of them is the user's decision.
 */
export function unlockSound() {
  void context()?.resume();
  ensureSuccessClip();
}

export function setSoundMuted(next: boolean) {
  muted = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "off" : "on");
  } catch {
    /* Private window or storage disabled: the setting still applies for this session. */
  }
  if (next) {
    if (successClip) successClip.pause();
    return;
  }
  unlockSound();
}

function tone(
  audio: AudioContext,
  freq: number,
  at: number,
  duration: number,
  gain: number,
  type: OscillatorType = "sine",
) {
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0008, at + duration);
  osc.connect(amp);
  amp.connect(audio.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

function ensureSuccessClip() {
  if (typeof window === "undefined") return null;
  if (!successClip) {
    successClip = new Audio("/sounds/success.mp3");
    successClip.preload = "auto";
    successClip.volume = 0.55;
    successClip.load();
  }
  return successClip;
}

/** One-shot as soon as the last page is on screen. Mute-gated. */
export function playSetupReady() {
  const clip = ensureSuccessClip();
  if (muted || !clip) return;
  clip.currentTime = 0;
  void clip.play().catch(() => {
    /* Autoplay can fail until a gesture; they have already typed and tapped. */
  });
}

export function playSound(cue: SoundCue) {
  if (muted) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const mapped = cue === "curious" ? "start" : cue === "mcq" || cue === "social" || cue === "setup" ? "select" : cue;
  if (mapped === lastCue && now - lastCueAt < 90) return;
  lastCue = mapped;
  lastCueAt = now;

  const audio = context();
  if (!audio) return;
  void audio.resume();
  const t = audio.currentTime + 0.01;

  if (mapped === "start") {
    tone(audio, 440, t, 0.07, 0.018, "sine");
  } else if (mapped === "select") {
    tone(audio, 698, t, 0.045, 0.022, "sine");
    tone(audio, 880, t + 0.04, 0.05, 0.016, "sine");
  } else if (mapped === "progress") {
    tone(audio, 523, t, 0.06, 0.02, "sine");
    tone(audio, 659, t + 0.07, 0.09, 0.018, "triangle");
  } else {
    tone(audio, 392, t, 0.07, 0.022, "sine");
    tone(audio, 523, t + 0.08, 0.12, 0.024, "sine");
  }
}
