"use client";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { settle } from "@/sim/ledger";
import { LedgerStage, revealMs } from "./LedgerStage";

const SCENES = [
  { total: 1000, events: [{ type: "payment", amount: 400 }] },
  { total: 1200, events: [{ type: "credit", amount: 300 }, { type: "payment", amount: 500 }] },
  { total: 800, events: [{ type: "payment", amount: 800, bankReconciled: false }] },
] as const;

// Milliseconds. Events land, the question holds, the answer plays, then it rests.
const LAND_FIRST = 900;
const LAND_EVERY = 750;
const ASK_HOLD = 2400;
const REST = 3200;
const OUT = [0.23, 1, 0.32, 1] as const;
const SLOTS = Math.max(...SCENES.map((s) => s.events.length));

type Phase = "landing" | "asking" | "answering";

/**
 * A looping demo of predict-then-watch. Events land on the invoice, the owed amount
 * stays a question while the Predict line fills, then the answer plays out step by step.
 * It runs only while it is on screen.
 */
export function Hero() {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState<Phase>("landing");
  const [visible, setVisible] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const scene = useMemo(() => ({ total: SCENES[index].total, events: [...SCENES[index].events] }), [index]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    const onHide = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    setShown(0);
    setPhase("landing");
    scene.events.forEach((_, i) => at(LAND_FIRST + i * LAND_EVERY, () => setShown(i + 1)));
    const askAt = LAND_FIRST + (scene.events.length - 1) * LAND_EVERY + 300;
    at(askAt, () => setPhase("asking"));
    const answerAt = askAt + ASK_HOLD;
    at(answerAt, () => setPhase("answering"));
    const matches = settle(scene.total, scene.events).partials.length;
    at(answerAt + revealMs(matches) + REST, () => {
      setShown(0);
      setPhase("landing");
      setIndex((i) => (i + 1) % SCENES.length);
    });
    return () => timers.forEach(clearTimeout);
  }, [scene, visible]);

  const answering = phase === "answering";
  return (
    <div ref={root}>
      <LedgerStage scene={scene} reveal={answering} shown={shown} slots={SLOTS} live={false} />
      <div className="mt-3 flex gap-6 text-sm font-semibold" aria-hidden>
        <Step label="Predict" on={phase === "asking"} fill={phase !== "landing"} duration={ASK_HOLD / 1000} ease="linear" reset={index} />
        <Step label="Watch" on={answering} fill={answering} duration={0.7} ease={OUT} reset={index} />
      </div>
    </div>
  );
}

/** A label with a thin line under it. The line fills while the step is under way. */
function Step({ label, on, fill, duration, ease, reset }: { label: string; on: boolean; fill: boolean; duration: number; ease: "linear" | typeof OUT; reset: number }) {
  return (
    <span className={`relative pb-1 transition-colors duration-200 ${on ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}>
      {label}
      <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[var(--line)]" />
      <motion.span
        key={reset}
        className="absolute inset-x-0 bottom-0 h-0.5 origin-left rounded-full bg-[var(--odoo)]"
        initial={false}
        animate={{ scaleX: fill ? 1 : 0 }}
        transition={fill ? { duration, ease } : { duration: 0 }}
      />
    </span>
  );
}
