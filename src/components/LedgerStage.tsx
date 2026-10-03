"use client";
import { Bank, Receipt, Scroll } from "@phosphor-icons/react";
import { animate, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { Scene } from "@/learning/session";
import { money } from "@/learning/session";
import { settle } from "@/sim/ledger";

const TONE = { payment: "#1f9d6b", credit: "#4c7bd8" } as const;

/** Counts from `from` to `to` once `active` flips on. */
function useCount(from: number, to: number, active: boolean) {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (!active) return setValue(from);
    const controls = animate(from, to, { duration: 0.9, delay: 0.25, ease: "easeOut", onUpdate: (v) => setValue(Math.round(v)) });
    return () => controls.stop();
  }, [from, to, active]);
  return value;
}

/**
 * The invoice as a bar. Before the answer, the events sit beside it and the
 * residual is hidden. On reveal, each match fills the bar and the residual counts down.
 */
export function LedgerStage({ scene, reveal }: { scene: Scene; reveal: boolean }) {
  const s = useMemo(() => settle(scene.total, scene.events), [scene]);
  const residual = useCount(scene.total, s.residual, reveal);
  const kindOf = (label: string) => (label.startsWith("Credit") ? "credit" : "payment");
  let offset = 0;

  return (
    <div className="panel p-4 sm:p-5">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span className="flex items-center gap-2">
          <Receipt size={20} weight="duotone" className="text-[var(--odoo)]" />
          Invoice {money(scene.total)}
        </span>
        <span className="mono text-xs text-[var(--muted)]">amount_residual</span>
      </div>

      <div className="relative mt-3 h-11 overflow-hidden rounded-xl border border-[var(--line)] hatch">
        {s.partials.map((p, i) => {
          const left = (offset / scene.total) * 100;
          const width = (p.amount / scene.total) * 100;
          offset += p.amount;
          return (
            <motion.div
              key={p.credit}
              className="absolute inset-y-0 grid place-items-center overflow-hidden text-xs font-bold text-white"
              style={{ left: `${left}%`, background: TONE[kindOf(p.credit)] }}
              initial={{ width: 0 }}
              animate={{ width: reveal ? `${width}%` : 0 }}
              transition={{ duration: 0.6, delay: reveal ? 0.2 + i * 0.5 : 0 }}
            >
              {reveal && width > 12 && money(p.amount)}
            </motion.div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {s.lines.slice(1).map((l) => {
          const kind = l.kind === "credit" ? "credit" : "payment";
          return (
            <span key={l.label} className="flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold">
              {kind === "payment" ? <Bank size={15} weight="fill" color={TONE.payment} /> : <Scroll size={15} weight="fill" color={TONE.credit} />}
              {l.label} · {money(l.amount)}
              {reveal && l.residual > 0 && <span className="text-[var(--amber-deep)]">· {money(l.residual)} stays open</span>}
            </span>
          );
        })}
        <span className="ml-auto flex items-center gap-2 text-sm font-bold">
          <span className="text-[var(--muted)]">Owed</span>
          <span className="mono text-lg" aria-live="polite">{reveal ? money(residual) : "?"}</span>
          {reveal && <span className="mono rounded-full bg-[var(--odoo-soft)] px-2.5 py-0.5 text-xs">{s.paymentState}</span>}
        </span>
      </div>
    </div>
  );
}
