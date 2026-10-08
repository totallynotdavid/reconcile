"use client";
import { Exam, Stack, Trophy } from "@phosphor-icons/react";
import Link from "next/link";
import { dueConcepts } from "@/learning/leitner";
import { useProgress } from "@/learning/store";
import { useReady } from "./Hydrate";

export function Nav() {
  const ready = useReady();
  const concepts = useProgress((s) => s.concepts);
  const due = ready ? dueConcepts(concepts, Date.now()).length : 0;
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[#fffdfb]/80 backdrop-blur">
      <nav className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-2.5 text-sm font-semibold">
        <Link href="/" className="mr-auto flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--odoo)] text-lg font-extrabold text-white shadow-[0_3px_0_var(--odoo-deep)]">R</span>
          <span className="text-base">Reconcile</span>
        </Link>
        <Link href="/review/" className="flex items-center gap-1.5 rounded-xl px-3 py-2 hover:bg-[var(--odoo-soft)]">
          <Stack size={18} weight="bold" />
          Review
          {due > 0 && <span className="rounded-full bg-[var(--amber)] px-2 py-0.5 text-xs text-[#3a2208]">{due}</span>}
        </Link>
        <Link href="/exam/" className="flex items-center gap-1.5 rounded-xl px-3 py-2 hover:bg-[var(--odoo-soft)]">
          <Exam size={18} weight="bold" />
          Exam
        </Link>
        <Link href="/leaderboard/" aria-label="Leaderboard" className="flex items-center gap-1.5 rounded-xl px-3 py-2 hover:bg-[var(--odoo-soft)]">
          <Trophy size={18} weight="bold" />
          <span className="hidden sm:inline">Leaderboard</span>
        </Link>
      </nav>
    </header>
  );
}
