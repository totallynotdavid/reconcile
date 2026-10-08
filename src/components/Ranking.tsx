"use client";
import { Trophy } from "@phosphor-icons/react";
import Link from "next/link";
import type { RunState } from "@/learning/run";

/** What the server made of the run: points earned, and where they put the player. */
export function Ranking({ state }: { state: RunState }) {
  if (state.status === "idle") return null;
  const note = "panel flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm";
  if (state.status === "scoring") return <p className={note}>Scoring…</p>;
  if (state.status === "failed") return <p className={note}>Not scored: {state.error}</p>;
  if (state.status === "anonymous") {
    return (
      <p className={note}>
        <Trophy size={18} weight="fill" className="text-[var(--amber-deep)]" />
        <span className="flex-1">Pick a nickname to count these answers on the leaderboard.</span>
        <Link href="/leaderboard/" className="font-bold text-[var(--odoo)] underline">
          Join
        </Link>
      </p>
    );
  }
  const { award } = state;
  return (
    <p className={note}>
      <Trophy size={18} weight="fill" className="text-[var(--amber-deep)]" />
      <span className="font-bold">{award.points > 0 ? `+${award.points} points` : "No new points"}</span>
      {award.points === 0 && <span className="text-[var(--muted)]">Each card pays once a day.</span>}
      {award.week?.rank && <span>#{award.week.rank} this week</span>}
      {award.all?.rank && <span>#{award.all.rank} all time</span>}
      <Link href="/leaderboard/" className="ml-auto font-bold text-[var(--odoo)] underline">
        Leaderboard
      </Link>
    </p>
  );
}
