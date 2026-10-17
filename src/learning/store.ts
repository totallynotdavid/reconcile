"use client";
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { dueConcepts } from "./leitner";
import {
  type Answer,
  type ProgressData,
  emptyProgress,
  recordExam,
  recordLevel,
  recordReview,
} from "./progress";

type Store = ProgressData & {
  finishLevel: (levelId: string, answers: Answer[]) => void;
  finishReview: (answers: Answer[]) => void;
  finishExam: (answers: Answer[]) => void;
  reset: () => void;
};

const data = (s: Store): ProgressData => ({
  levels: s.levels,
  concepts: s.concepts,
  reviews: s.reviews,
  exam: s.exam,
});

export const useProgress = create<Store>()(
  persist(
    (set, get) => ({
      ...emptyProgress(),
      finishLevel: (levelId, answers) =>
        set(recordLevel(data(get()), levelId, answers, Date.now())),
      finishReview: (answers) =>
        set(recordReview(data(get()), answers, Date.now())),
      finishExam: (answers) =>
        set(recordExam(data(get()), answers, Date.now())),
      reset: () => set(emptyProgress()),
    }),
    { name: "reconcile-progress", skipHydration: true },
  ),
);

const CLOCK_MS = 60_000;

/** The time, refreshed every minute so a page left open still counts what has come due. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function useDueCount(): number {
  const concepts = useProgress((s) => s.concepts);
  const now = useNow();
  return useMemo(() => dueConcepts(concepts, now).length, [concepts, now]);
}
