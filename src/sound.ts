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
let describeStarted = false;
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
  ensureSuccessClip();
  if (describeWanted) startDescribeOnce();
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

/** Keyboard clip once when they start typing. Same slow speed, no loop. Mute-gated. */
export function playDescribeKeyboard() {
  describeWanted = true;
  if (muted) return;
  startDescribeOnce();
}

function startDescribeOnce() {
  if (describeStarted) return;
  if (typeof window === "undefined") return;
  describeStarted = true;
  if (!describeClip) {
    describeClip = new Audio("/sounds/computer-keyboard.mp3");
    describeClip.preload = "auto";
    describeClip.volume = 0.5;
  }
  describeClip.loop = false;
  describeClip.playbackRate = 0.58;
  describeClip.preservesPitch = true;
  describeClip.currentTime = 0;
  void describeClip.play().catch(() => {
    describeStarted = false;
  });
  ensureSuccessClip();
}

export function stopDescribeKeyboard() {
  describeWanted = false;
  describeStarted = false;
  if (!describeClip) return;
  describeClip.pause();
  describeClip.currentTime = 0;
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
