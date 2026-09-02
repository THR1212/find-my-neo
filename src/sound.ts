/**
 * Three short cues, generated in the browser so we don't ship audio files.
 * Muted until someone turns the toggle on — a quiet room must never surprise the demo.
 */

export type SoundCue = "advance" | "reveal" | "cta";

let muted = true;
let ctx: AudioContext | null = null;

export function soundIsMuted() {
  return muted;
}

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

export function setSoundMuted(next: boolean) {
  muted = next;
  if (!next) void context()?.resume();
}

function tone(
  audio: AudioContext,
  freq: number,
  at: number,
  duration: number,
  gain = 0.045,
) {
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, at);
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0008, at + duration);
  osc.connect(amp);
  amp.connect(audio.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

export function playSound(cue: SoundCue) {
  if (muted) return;
  const audio = context();
  if (!audio) return;
  void audio.resume();
  const t = audio.currentTime + 0.01;
  if (cue === "advance") {
    tone(audio, 628, t, 0.07, 0.035);
  } else if (cue === "reveal") {
    tone(audio, 523, t, 0.09, 0.04);
    tone(audio, 784, t + 0.1, 0.14, 0.038);
  } else {
    tone(audio, 392, t, 0.08, 0.04);
    tone(audio, 523, t + 0.08, 0.16, 0.05);
  }
}
