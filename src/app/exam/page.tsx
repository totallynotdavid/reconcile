"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Gate } from "@/components/Hydrate";
import { Session } from "@/components/Session";
import { ALL_CARDS } from "@/content";
import { rng } from "@/learning/session";
import { useRun } from "@/learning/run";
import { useProgress } from "@/learning/store";

const EXAM_SIZE = 20;

export default function Exam() {
  return (
    <Gate>
      <ExamRound />
    </Gate>
  );
}

function ExamRound() {
  const finishExam = useProgress((s) => s.finishExam);
  const [seed] = useState(() => Date.now());
  const run = useRun();
  const cards = useMemo(() => {
    const rand = rng(seed);
    return [...ALL_CARDS].sort(() => rand() - 0.5).slice(0, EXAM_SIZE);
  }, [seed]);

  return (
    <div>
      <h1 className="mb-1 text-3xl font-extrabold tracking-tight">Mixed exam</h1>
      <p className="mb-5 text-[var(--muted)]">{EXAM_SIZE} cards from every track. Pass at 80%.</p>
      <Session
        cards={cards}
        seed={seed}
        run={run}
        onDone={finishExam}
        footer={(_, retry) => (
          <div className="flex gap-3">
            <button className="btn btn-primary px-4" onClick={retry}>
              Same cards, new figures
            </button>
            <Link href="/" className="btn px-4">
              Home
            </Link>
          </div>
        )}
      />
    </div>
  );
}
