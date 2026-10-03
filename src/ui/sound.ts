"use client";
import { create } from "zustand";

const KEY = "odoo-senior-sound";

type SoundStore = { on: boolean; toggle: () => void; load: () => void };

export const useSound = create<SoundStore>((set, get) => ({
  on: true,
  toggle: () => {
    const on = !get().on;
    localStorage.setItem(KEY, on ? "on" : "off");
    set({ on });
  },
  load: () => set({ on: localStorage.getItem(KEY) !== "off" }),
}));

type Cue = "ok" | "bad" | "done" | "tap";

/** Notes as [frequency Hz, start s, length s]. Synthesized, so there are no asset files. */
const CUES: Record<Cue, { wave: OscillatorType; notes: [number, number, number][] }> = {
  ok: { wave: "triangle", notes: [[660, 0, 0.1], [880, 0.08, 0.16]] },
  bad: { wave: "sawtooth", notes: [[220, 0, 0.14], [165, 0.1, 0.22]] },
  done: { wave: "triangle", notes: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1047, 0.3, 0.3]] },
  tap: { wave: "square", notes: [[440, 0, 0.04]] },
};

let ctx: AudioContext | null = null;

export function play(cue: Cue) {
  if (!useSound.getState().on || typeof AudioContext === "undefined") return;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  const { wave, notes } = CUES[cue];
  const now = ctx.currentTime;
  for (const [freq, start, length] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(0.12, now + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + length + 0.02);
  }
}
