/**
 * Original cues only — muted until the visible toggle is on.
 * We do not ship Instagram's (or anyone's) notification sound. The "social" cue is a
 * short original double-ping that reads as a message, not a copy of a brand asset.
 */

export type SoundCue = "curious" | "mcq" | "social" | "setup" | "cta";

let muted = true;
let ctx: AudioContext | null = null;
let describeClip: HTMLAudioElement | null = null;
let describeWanted = false;
let successClip: HTMLAudioElement | null = null;

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

export function setSoundMuted(next: boolean) {
  muted = next;
  if (next) {
    if (describeClip) describeClip.pause();
    if (successClip) successClip.pause();
    return;
  }
  void context()?.resume();
  if (describeWanted && describeClip) void describeClip.play().catch(() => {});
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
  amp.gain.linearRampToValueAtTime(gain, at + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0008, at + duration);
  osc.connect(amp);
  amp.connect(audio.destination);
  osc.start(at);
  osc.stop(at + duration + 0.03);
}

/** Loop the keyboard clip while they are writing the business. Mute-gated. */
export function playDescribeKeyboard() {
  describeWanted = true;
  if (muted) return;
  if (typeof window === "undefined") return;
  if (!describeClip) {
    describeClip = new Audio("/sounds/computer-keyboard.mp3");
    describeClip.preload = "auto";
    describeClip.volume = 0.5;
  }
  describeClip.loop = true;
  describeClip.playbackRate = 0.58;
  describeClip.preservesPitch = true;
  if (!describeClip.paused) return;
  void describeClip.play().catch(() => {
    /* Autoplay can fail until a gesture; typing and Continue are gestures. */
  });
}

export function stopDescribeKeyboard() {
  describeWanted = false;
  if (!describeClip) return;
  describeClip.pause();
  describeClip.currentTime = 0;
}

/** One-shot on the last page, when the setup (and generated site, if shown) is ready. */
export function playSetupReady() {
  if (muted) return;
  if (typeof window === "undefined") return;
  if (!successClip) {
    successClip = new Audio("/sounds/success.mp3");
    successClip.preload = "auto";
    successClip.volume = 0.55;
  }
  successClip.currentTime = 0;
  void successClip.play().catch(() => {
    /* Autoplay can fail until a gesture; they have already typed and tapped. */
  });
}

export function playSound(cue: SoundCue) {
  if (muted) return;
  const audio = context();
  if (!audio) return;
  void audio.resume();
  const t = audio.currentTime + 0.01;

  if (cue === "curious") {
    tone(audio, 392, t, 0.09, 0.04, "sine");
    tone(audio, 494, t + 0.1, 0.1, 0.04, "sine");
    tone(audio, 587, t + 0.22, 0.16, 0.045, "triangle");
  } else if (cue === "mcq") {
    tone(audio, 704, t, 0.055, 0.032, "sine");
    tone(audio, 880, t + 0.05, 0.05, 0.028, "triangle");
  } else if (cue === "social") {
    tone(audio, 1174, t, 0.07, 0.038, "triangle");
    tone(audio, 1397, t + 0.09, 0.11, 0.042, "triangle");
  } else if (cue === "setup") {
    tone(audio, 392, t, 0.14, 0.04, "sine");
    tone(audio, 523, t + 0.11, 0.14, 0.04, "sine");
    tone(audio, 659, t + 0.22, 0.22, 0.045, "triangle");
  } else {
    tone(audio, 330, t, 0.08, 0.04, "sine");
    tone(audio, 440, t + 0.09, 0.16, 0.05, "sine");
  }
}
