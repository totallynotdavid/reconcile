"use client";
import { ArrowLeft, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { Gate } from "@/components/Hydrate";
import { Session } from "@/components/Session";
import { findLevel } from "@/content";
import { useRun } from "@/learning/run";
import { useProgress } from "@/learning/store";

export function LevelPlayer({ id }: { id: string }) {
  return (
    <Gate>
      <Level id={id} />
    </Gate>
  );
}

function Level({ id }: { id: string }) {
  const found = findLevel(id);
  const finishLevel = useProgress((s) => s.finishLevel);
  const [started, setStarted] = useState(false);
  const [seed] = useState(() => Date.now());
  const run = useRun();
  if (!found) return <p>Unknown level.</p>;
  const { track, level, index } = found;
  const nextLevel = track.levels[index + 1];

  if (!started) {
    const kinds = { predict: 0, choice: 0, bug: 0, triage: 0 };
    for (const c of level.cards) kinds[c.kind]++;
    const parts = [
      kinds.predict && `${kinds.predict} predict`,
      kinds.choice && `${kinds.choice} decide`,
      kinds.bug && `${kinds.bug} spot the bug`,
      kinds.triage && `${kinds.triage} triage`,
    ].filter(Boolean);
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
          <ArrowLeft size={16} weight="bold" /> {track.title}
        </Link>
        <div>
          <p className="eyebrow">
            Level {index + 1} of {track.levels.length}
          </p>
          <h1 className="mt-1 text-4xl font-extrabold tracking-tight">{level.title}</h1>
          <p className="mt-2 text-lg text-[var(--muted)]">{level.brief}</p>
          <p className="mt-3 text-sm font-semibold">{parts.join(" · ")}</p>
        </div>
        <div className="panel flex gap-3 border-l-4 border-l-[var(--amber)] p-4">
          <Warning size={22} weight="fill" className="mt-0.5 shrink-0 text-[var(--amber-deep)]" />
          <div className="text-sm">
            <p className="font-bold">Where the model lies</p>
            <p className="mt-1 text-[var(--muted)]">{level.caveat}</p>
          </div>
        </div>
        <button className="btn btn-primary w-full py-3 text-lg" onClick={() => setStarted(true)}>
          Start
        </button>
      </div>
    );
  }

  return (
    <Session
      cards={level.cards}
      seed={seed}
      run={run}
      onDone={(answers) => finishLevel(id, answers)}
      footer={(passed, retry) => (
        <div className="flex gap-3">
          {!passed && (
            <button className="btn btn-primary px-6" onClick={retry}>
              Retry
            </button>
          )}
          {passed && nextLevel && (
            <Link className="btn btn-primary px-6" href={`/level/${nextLevel.id}/`}>
              Next level
            </Link>
          )}
          <Link className="btn px-4" href="/">
            Home
          </Link>
        </div>
      )}
    />
  );
}
