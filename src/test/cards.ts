import { ALL_CARDS } from "@/content";
import type { Choice } from "@/learning/judge";
import { prepare } from "@/learning/session";

const card = (id: string) => ALL_CARDS.find((c) => c.id === id)!;

/** What a perfect player sends: the index of the right option as shown for this seed. */
export function rightChoice(id: string, seed: number): Choice {
  const item = prepare(card(id), seed);
  return item.kind === "triage" ? item.steps.map((s) => s.answer) : [item.answer];
}

/** Any index that is in range and not the right one. */
export function wrongChoice(id: string, seed: number): Choice {
  const item = prepare(card(id), seed);
  if (item.kind === "triage") return item.steps.map((s) => (s.answer + 1) % s.options.length);
  const size = item.kind === "bug" ? item.lines.length : item.options.length;
  return [(item.answer + 1) % size];
}

/** `n` card ids from position `from` in the deck. */
export const ids = (n: number, from = 0) => ALL_CARDS.slice(from, from + n).map((c) => c.id);
