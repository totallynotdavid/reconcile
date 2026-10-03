"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
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

const data = (s: Store): ProgressData => ({ levels: s.levels, concepts: s.concepts, reviews: s.reviews, exam: s.exam });

export const useProgress = create<Store>()(
  persist(
    (set, get) => ({
      ...emptyProgress(),
      finishLevel: (levelId, answers) => set(recordLevel(data(get()), levelId, answers, Date.now())),
      finishReview: (answers) => set(recordReview(data(get()), answers, Date.now())),
      finishExam: (answers) => set(recordExam(data(get()), answers, Date.now())),
      reset: () => set(emptyProgress()),
    }),
    { name: "odoo-senior-progress", skipHydration: true },
  ),
);
