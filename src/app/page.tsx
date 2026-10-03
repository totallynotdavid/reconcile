"use client";
import { ArrowRight, Check, Lock, Star } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { Hero } from "@/components/Hero";
import { Gate } from "@/components/Hydrate";
import { TRACKS } from "@/content";
import type { Level, Track } from "@/content/types";
import { INTERVALS, dueConcepts } from "@/learning/leitner";
import { isUnlocked, stars } from "@/learning/progress";
import { useProgress } from "@/learning/store";

export default function Home() {
  return (
    <Gate>
      <Tracks />
    </Gate>
  );
}

function nextLevel(progress: ReturnType<typeof useProgress.getState>) {
  for (const track of TRACKS) {
    const ids = track.levels.map((l) => l.id);
    const i = track.levels.findIndex((l, n) => isUnlocked(progress, ids, n) && !progress.levels[l.id]?.passed);
    if (i >= 0) return track.levels[i];
  }
  return null;
}

function Tracks() {
  const progress = useProgress();
  const due = dueConcepts(progress.concepts, Date.now()).length;
  const tracked = Object.entries(progress.concepts);
  const resume = nextLevel(progress);
  const passed = Object.values(progress.levels).filter((l) => l.passed).length;
  const total = TRACKS.reduce((n, t) => n + t.levels.length, 0);

  return (
    <div className="space-y-10">
      <section className="grid items-center gap-6 pt-4 lg:grid-cols-2">
        <div>
          <p className="eyebrow">Odoo 16 to 20 · senior level</p>
          <h1 className="mt-2 text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Know what the <span className="text-[var(--odoo)]">ledger</span> will do.
          </h1>
          <p className="mt-4 max-w-md text-lg text-[var(--muted)]">Predict first, then watch. Spot the bug, decide, recall. Every card cites its source and says whether the docs back it.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {resume && (
              <Link href={`/level/${resume.id}/`} className="btn btn-primary flex items-center gap-2 px-6 py-3 text-lg">
                {passed === 0 ? "Start" : "Continue"} <ArrowRight size={20} weight="bold" />
              </Link>
            )}
            <Link href="/review/" className="btn px-5 py-3 text-lg">
              {due > 0 ? `Review ${due} due` : "Nothing due"}
            </Link>
            <Link href="/exam/" className="btn px-5 py-3 text-lg">
              Mixed exam{progress.exam ? ` · ${progress.exam.best}/${progress.exam.total}` : ""}
            </Link>
          </div>
          <p className="mt-4 text-sm text-[var(--muted)]">
            {passed} of {total} levels passed
          </p>
        </div>
        <Hero />
      </section>

      {TRACKS.map((track) => (
        <TrackPath key={track.id} track={track} />
      ))}

      {tracked.length > 0 && (
        <section>
          <h2 className="text-xl font-extrabold">Memory</h2>
          <p className="text-sm text-[var(--muted)]">Box 1 is weakest. Review interval grows with the box: {INTERVALS.slice(2).join(", ")} days.</p>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {tracked
              .sort(([, a], [, b]) => a.box - b.box)
              .map(([slug, s]) => (
                <li key={slug} className="panel flex items-center justify-between px-4 py-2.5">
                  <span className="mono text-xs">{slug}</span>
                  <span className="flex gap-1" aria-label={`box ${s.box} of 6`}>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <span key={n} className={`size-2.5 rounded-full ${n <= s.box ? "bg-[var(--odoo)]" : "bg-[var(--line)]"}`} />
                    ))}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TrackPath({ track }: { track: Track }) {
  const progress = useProgress();
  const ids = track.levels.map((l) => l.id);
  const firstOpen = track.levels.findIndex((l, i) => isUnlocked(progress, ids, i) && !progress.levels[l.id]?.passed);
  const [selected, setSelected] = useState(Math.max(0, firstOpen));
  const level = track.levels[selected];
  const open = isUnlocked(progress, ids, selected);

  return (
    <section>
      <h2 className="text-2xl font-extrabold">{track.title}</h2>
      <p className="text-[var(--muted)]">{track.summary}</p>
      <div className="panel mt-4 p-5">
        <ol className="flex flex-wrap items-start gap-x-2 gap-y-4">
          {track.levels.map((l, i) => (
            <li key={l.id} className="flex items-start gap-2">
              <Node level={l} index={i} unlocked={isUnlocked(progress, ids, i)} active={i === selected} onSelect={() => setSelected(i)} />
              {i < track.levels.length - 1 && <span aria-hidden className="mt-7 hidden h-0 w-6 border-t-[3px] border-dotted border-[var(--line)] sm:block" />}
            </li>
          ))}
        </ol>
        <LevelDetail level={level} unlocked={open} />
      </div>
    </section>
  );
}

function Node({ level, index, unlocked, active, onSelect }: { level: Level; index: number; unlocked: boolean; active: boolean; onSelect: () => void }) {
  const result = useProgress((s) => s.levels[level.id]);
  const done = result?.passed;
  const tone = done ? "bg-[var(--good)] text-white shadow-[0_4px_0_#157a52]" : unlocked ? "bg-[var(--amber)] text-[#3a2208] shadow-[0_4px_0_var(--amber-deep)]" : "bg-[var(--line)] text-[var(--muted)] shadow-[0_4px_0_#d5c9d2]";
  const n = stars(result);
  return (
    <button onClick={onSelect} aria-pressed={active} aria-label={level.title} className="flex w-24 cursor-pointer flex-col items-center gap-1.5 text-center">
      <span className={`grid size-14 place-items-center rounded-full text-lg font-extrabold transition-transform ${tone} ${active ? "scale-110 ring-4 ring-[var(--odoo)]/25" : ""}`}>
        {done ? <Check size={26} weight="bold" /> : unlocked ? index + 1 : <Lock size={22} weight="fill" />}
      </span>
      <span className="flex gap-0.5">
        {[1, 2, 3].map((s) => (
          <Star key={s} size={13} weight="fill" color={s <= n ? "var(--amber)" : "var(--line)"} />
        ))}
      </span>
      <span className="text-xs font-semibold leading-tight">{level.title}</span>
    </button>
  );
}

function LevelDetail({ level, unlocked }: { level: Level; unlocked: boolean }) {
  const result = useProgress((s) => s.levels[level.id]);
  return (
    <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-[var(--odoo-soft)] p-4 sm:flex-row sm:items-center">
      <div className="flex-1">
        <h3 className="text-lg font-extrabold">{level.title}</h3>
        <p className="text-sm">{level.brief}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {level.cards.length} cards{result ? ` · best ${result.best}/${result.total} · ${result.attempts} ${result.attempts === 1 ? "try" : "tries"}` : ""}
        </p>
      </div>
      {unlocked ? (
        <Link href={`/level/${level.id}/`} className="btn btn-plum flex items-center justify-center gap-2 px-6">
          {result?.passed ? "Play again" : "Play"} <ArrowRight size={18} weight="bold" />
        </Link>
      ) : (
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--muted)]">
          <Lock size={18} weight="fill" /> Pass the level before it
        </span>
      )}
    </div>
  );
}
