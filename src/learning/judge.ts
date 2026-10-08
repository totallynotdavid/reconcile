import type { Card } from "@/content/types";
import { prepare } from "./session";

/** What a player picked on one card: one index, or one per step on a triage card. Indexes are as shown, after the shuffle. */
export type Choice = number[];

const inRange = (n: unknown, size: number): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < size;

/**
 * Re-derives the card from the seed the player saw and checks the picks against it.
 * Returns null when the picks do not fit the card, which no honest client sends.
 */
export function judge(card: Card, seed: number, choice: unknown): boolean | null {
  if (!Array.isArray(choice)) return null;
  const item = prepare(card, seed);
  if (item.kind === "triage") {
    if (choice.length !== item.steps.length) return null;
    if (!choice.every((c, i) => inRange(c, item.steps[i].options.length))) return null;
    return choice.every((c, i) => c === item.steps[i].answer);
  }
  const size = item.kind === "bug" ? item.lines.length : item.options.length;
  if (choice.length !== 1 || !inRange(choice[0], size)) return null;
  return choice[0] === item.answer;
}
