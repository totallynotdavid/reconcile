"use client";
import { Exam, SpeakerHigh, SpeakerSlash, Stack } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect } from "react";
import { dueConcepts } from "@/learning/leitner";
import { useProgress } from "@/learning/store";
import { useSound } from "@/ui/sound";
import { useReady } from "./Hydrate";

export function Nav() {
  const ready = useReady();
  const concepts = useProgress((s) => s.concepts);
  const { on, toggle, load } = useSound();
  useEffect(load, [load]);
  const due = ready ? dueConcepts(concepts, Date.now()).length : 0;
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[#fffdfb]/80 backdrop-blur">
      <nav className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-2.5 text-sm font-semibold">
        <Link href="/" className="mr-auto flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--odoo)] text-lg font-extrabold text-white shadow-[0_3px_0_var(--odoo-deep)]">O</span>
          <span className="text-base">Odoo Senior</span>
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
        <button aria-label={on ? "Sound on" : "Sound off"} onClick={toggle} className="grid size-9 place-items-center rounded-xl hover:bg-[var(--odoo-soft)]">
          {on ? <SpeakerHigh size={19} weight="bold" /> : <SpeakerSlash size={19} weight="bold" />}
        </button>
      </nav>
    </header>
  );
}
