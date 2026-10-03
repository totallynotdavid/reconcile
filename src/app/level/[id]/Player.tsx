"use client";
import Link from "next/link";
import { useState } from "react";
import { Gate } from "@/components/Hydrate";
import { Session } from "@/components/Session";
import { findLevel } from "@/content";
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
  if (!found) return <p>Unknown level.</p>;
  const { track, level, index } = found;
  const nextLevel = track.levels[index + 1];

  if (!started) {
    return (
      <div>
        <p className="text-xs uppercase opacity-60">{track.title}</p>
        <h1 className="mt-1 text-2xl font-bold">{level.title}</h1>
        <p className="mt-3">{level.brief}</p>
        <div className="mt-4 rounded-lg border border-[var(--line)] bg-white p-3 text-sm">
          <p className="font-semibold">Where the model lies</p>
          <p className="mt-1 opacity-80">{level.caveat}</p>
        </div>
        <button className="btn btn-primary mt-5 w-full" onClick={() => setStarted(true)}>
          Start ({level.cards.length} cards)
        </button>
      </div>
    );
  }

  return (
    <Session
      cards={level.cards}
      seed={seed}
      onDone={(answers) => finishLevel(id, answers)}
      footer={(passed, retry) => (
        <div className="flex gap-3">
          {!passed && (
            <button className="btn btn-primary px-4" onClick={retry}>
              Retry
            </button>
          )}
          {passed && nextLevel && (
            <Link className="btn btn-primary px-4" href={`/level/${nextLevel.id}/`}>
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
