import { type ConceptState, grade, passed } from "./leitner";

export type Answer = { concept: string; correct: boolean };
export type LevelResult = { best: number; total: number; passed: boolean; attempts: number };

export type ProgressData = {
  levels: Record<string, LevelResult>;
  concepts: Record<string, ConceptState>;
  /** Days (YYYY-MM-DD) on which a review was completed. */
  reviews: string[];
  exam: { best: number; total: number } | null;
};

export const emptyProgress = (): ProgressData => ({ levels: {}, concepts: {}, reviews: [], exam: null });

const day = (now: number) => new Date(now).toISOString().slice(0, 10);

function gradeConcepts(concepts: ProgressData["concepts"], answers: Answer[], now: number) {
  const next = { ...concepts };
  for (const a of answers) next[a.concept] = grade(next[a.concept], a.correct, now);
  return next;
}

export function recordLevel(data: ProgressData, levelId: string, answers: Answer[], now: number): ProgressData {
  const correct = answers.filter((a) => a.correct).length;
  const before = data.levels[levelId];
  const result: LevelResult = {
    best: Math.max(before?.best ?? 0, correct),
    total: answers.length,
    passed: (before?.passed ?? false) || passed(correct, answers.length),
    attempts: (before?.attempts ?? 0) + 1,
  };
  return { ...data, levels: { ...data.levels, [levelId]: result }, concepts: gradeConcepts(data.concepts, answers, now) };
}

export function recordReview(data: ProgressData, answers: Answer[], now: number): ProgressData {
  const today = day(now);
  return {
    ...data,
    concepts: gradeConcepts(data.concepts, answers, now),
    reviews: data.reviews.includes(today) ? data.reviews : [...data.reviews, today],
  };
}

export function recordExam(data: ProgressData, answers: Answer[], now: number): ProgressData {
  const correct = answers.filter((a) => a.correct).length;
  const best = Math.max(data.exam?.best ?? 0, correct);
  return { ...data, exam: { best, total: answers.length }, concepts: gradeConcepts(data.concepts, answers, now) };
}

/** A level opens when it is the first of its track or the one before it was passed. */
export function isUnlocked(data: ProgressData, trackLevelIds: string[], index: number): boolean {
  return index === 0 || !!data.levels[trackLevelIds[index - 1]]?.passed;
}
