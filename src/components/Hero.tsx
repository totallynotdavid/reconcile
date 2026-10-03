"use client";
import { useEffect, useState } from "react";
import { LedgerStage } from "./LedgerStage";

const SCENES = [
  { total: 1000, events: [{ type: "payment", amount: 400 }] },
  { total: 1200, events: [{ type: "credit", amount: 300 }, { type: "payment", amount: 500 }] },
  { total: 800, events: [{ type: "payment", amount: 800, bankReconciled: false }] },
] as const;

/** A looping demo of the ledger stage: it hides the answer, then reveals it. */
export function Hero() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2600);
    return () => clearInterval(id);
  }, []);
  const scene = SCENES[Math.floor(tick / 2) % SCENES.length];
  return <LedgerStage scene={{ total: scene.total, events: [...scene.events] }} reveal={tick % 2 === 1} />;
}
