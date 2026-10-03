"use client";
import Link from "next/link";
import { dueConcepts } from "@/learning/leitner";
import { useProgress } from "@/learning/store";
import { useReady } from "./Hydrate";

export function Nav() {
  const ready = useReady();
  const concepts = useProgress((s) => s.concepts);
  const due = ready ? dueConcepts(concepts, Date.now()).length : 0;
  return (
    <header className="border-b border-[var(--line)] bg-white">
      <nav className="mx-auto flex max-w-3xl items-center gap-5 px-4 py-3 text-sm">
        <Link href="/" className="font-bold text-[var(--odoo)]">
          Odoo Senior
        </Link>
        <Link href="/review/">Review{due > 0 && <span className="ml-1 rounded-full bg-[var(--odoo)] px-2 py-0.5 text-xs text-white">{due}</span>}</Link>
        <Link href="/exam/">Exam</Link>
      </nav>
    </header>
  );
}
