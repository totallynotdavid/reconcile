export const DAY = 86_400_000;
/** Review interval in days for each box. Box 1 is due immediately. */
export const INTERVALS = [0, 0, 1, 2, 4, 8, 16] as const;
export const MAX_BOX = INTERVALS.length - 1;
export const PASS_RATIO = 0.8;

export type ConceptState = { box: number; due: number };

export function grade(state: ConceptState | undefined, correct: boolean, now: number): ConceptState {
  const box = correct ? Math.min(MAX_BOX, (state?.box ?? 1) + 1) : 1;
  return { box, due: now + INTERVALS[box] * DAY };
}

export function isDue(state: ConceptState | undefined, now: number): boolean {
  return !!state && state.due <= now;
}

export function passed(correct: number, total: number): boolean {
  return total > 0 && correct / total >= PASS_RATIO;
}

/** Weakest first: lowest box, then earliest due date. */
export function dueConcepts(concepts: Record<string, ConceptState>, now: number): string[] {
  return Object.entries(concepts)
    .filter(([, s]) => isDue(s, now))
    .sort(([, a], [, b]) => a.box - b.box || a.due - b.due)
    .map(([slug]) => slug);
}
