"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { LedgerStage } from "./LedgerStage";

const SCENES = [
  { total: 1000, events: [{ type: "payment", amount: 400 }] },
  { total: 1200, events: [{ type: "credit", amount: 300 }, { type: "payment", amount: 500 }] },
  { total: 800, events: [{ type: "payment", amount: 800, bankReconciled: false }] },
] as const;

// Milliseconds. Events land, the question holds, the answer shows, then the next invoice.
const LAND_FIRST = 700;
const LAND_EVERY = 450;
const ASK_HOLD = 1300;
const ANSWER_HOLD = 2600;

/**
 * A looping demo of predict-then-watch. Events land on the invoice, the owed amount
 * stays a question for a beat, then the answer fills the bar. It pauses off screen.
 */
export function Hero() {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [visible, setVisible] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const scene = SCENES[index];

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
    setReveal(false);
    scene.events.forEach((_, i) => at(LAND_FIRST + i * LAND_EVERY, () => setShown(i + 1)));
    const askAt = LAND_FIRST + scene.events.length * LAND_EVERY;
    at(askAt + ASK_HOLD, () => setReveal(true));
    at(askAt + ASK_HOLD + ANSWER_HOLD, () => setIndex((i) => (i + 1) % SCENES.length));
    return () => timers.forEach(clearTimeout);
  }, [index, scene, visible]);

  const asking = !reveal;
  return (
    <div ref={root}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
        >
          <LedgerStage scene={{ total: scene.total, events: [...scene.events] }} reveal={reveal} shown={shown} />
        </motion.div>
      </AnimatePresence>
      <p className="mt-3 flex gap-4 text-sm font-semibold" aria-hidden>
        <span className={`transition-colors duration-200 ${asking ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}>Predict</span>
        <span className={`transition-colors duration-200 ${asking ? "text-[var(--muted)]" : "text-[var(--ink)]"}`}>Watch</span>
      </p>
    </div>
  );
}
