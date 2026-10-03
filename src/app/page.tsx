"use client";
import Link from "next/link";
import { Gate } from "@/components/Hydrate";
import { TRACKS } from "@/content";
import { INTERVALS, dueConcepts } from "@/learning/leitner";
import { isUnlocked } from "@/learning/progress";
import { useProgress } from "@/learning/store";

export default function Home() {
  return (
    <Gate>
      <Tracks />
    </Gate>
  );
}

function Tracks() {
  const progress = useProgress();
  const due = dueConcepts(progress.concepts, Date.now()).length;
  const tracked = Object.entries(progress.concepts);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold">Odoo 16 to 20, senior track</h1>
        <p className="mt-2 text-sm opacity-80">
          Predict, spot the bug, decide, recall. Each level is 4 to 6 cards. Pass at 80% to open the next. Every card cites its source and says whether the claim was read in the docs.
        </p>
        <div className="mt-3 flex gap-3">
          <Link href="/review/" className="btn btn-primary px-4">
            {due > 0 ? `Review ${due} due` : "Nothing due"}
          </Link>
          <Link href="/exam/" className="btn px-4">
            Mixed exam{progress.exam ? ` · best ${progress.exam.best}/${progress.exam.total}` : ""}
          </Link>
        </div>
      </section>

      {TRACKS.map((track) => {
        const ids = track.levels.map((l) => l.id);
        return (
          <section key={track.id}>
            <h2 className="text-lg font-semibold">{track.title}</h2>
            <p className="text-sm opacity-70">{track.summary}</p>
            <ol className="mt-3 grid gap-2">
              {track.levels.map((level, i) => {
                const open = isUnlocked(progress, ids, i);
                const result = progress.levels[level.id];
                const body = (
                  <>
                    <span className="font-medium">{level.title}</span>
                    <span className="block text-sm opacity-70">{level.brief}</span>
                    {result && (
                      <span className="mt-1 block text-xs">
                        {result.passed ? "passed" : "not passed"} · best {result.best}/{result.total} · {result.attempts} tries
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={level.id}>
                    {open ? (
                      <Link href={`/level/${level.id}/`} className={`btn block ${result?.passed ? "good" : ""}`}>
                        {body}
                      </Link>
                    ) : (
                      <div className="btn block opacity-50">
                        {body}
                        <span className="mt-1 block text-xs">Locked: pass the level above</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      {tracked.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">Concept strength</h2>
          <p className="text-sm opacity-70">Box 1 is weakest. Review interval grows with the box: {INTERVALS.slice(2).join(", ")} days.</p>
          <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            {tracked
              .sort(([, a], [, b]) => a.box - b.box)
              .map(([slug, s]) => (
                <li key={slug} className="flex items-center justify-between rounded border border-[var(--line)] bg-white px-3 py-1.5">
                  <span className="mono text-xs">{slug}</span>
                  <span className="text-xs">{"●".repeat(s.box)}{"○".repeat(6 - s.box)}</span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
