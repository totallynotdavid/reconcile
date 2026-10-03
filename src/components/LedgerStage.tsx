"use client";
import { Bank, Receipt, Scroll } from "@phosphor-icons/react";
import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { Scene } from "@/learning/session";
import { money } from "@/learning/session";
import { settle } from "@/sim/ledger";

const TONE = { payment: "#1f9d6b", credit: "#4c7bd8" } as const;
const OUT = [0.23, 1, 0.32, 1] as const;

/** Counts from `from` to `to` once `active` flips on. */
function useCount(from: number, to: number, active: boolean, instant: boolean) {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (!active || instant) return setValue(active ? to : from);
    const controls = animate(from, to, { duration: 0.7, delay: 0.15, ease: OUT, onUpdate: (v) => setValue(Math.round(v)) });
    return () => controls.stop();
  }, [from, to, active, instant]);
  return value;
}

/**
 * The invoice as a bar. Before the answer, the events sit beside it and the
 * residual is hidden. On reveal, each match fills the bar and the residual counts down.
 * `shown` is how many events have landed. Leave it out to show them all with no entrance.
 */
export function LedgerStage({ scene, reveal, shown }: { scene: Scene; reveal: boolean; shown?: number }) {
  const s = useMemo(() => settle(scene.total, scene.events), [scene]);
  const reduce = useReducedMotion() ?? false;
  const residual = useCount(scene.total, s.residual, reveal, reduce);
  const staged = shown !== undefined;
  const kindOf = (label: string) => (label.startsWith("Credit") ? "credit" : "payment");
  const lines = s.lines.slice(1);
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
              className="absolute inset-y-0 grid origin-left place-items-center overflow-hidden text-xs font-bold text-white"
              style={{ left: `${left}%`, width: `${width}%`, background: TONE[kindOf(p.credit)] }}
              initial={false}
              animate={{ scaleX: reveal ? 1 : 0 }}
              transition={reveal && !reduce ? { duration: 0.5, delay: 0.1 + i * 0.3, ease: OUT } : { duration: 0 }}
            >
              <span className="whitespace-nowrap">{reveal && width > 12 && money(p.amount)}</span>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {lines.map((l, i) => {
          const kind = l.kind === "credit" ? "credit" : "payment";
          const landed = !staged || i < shown;
          return (
            <motion.span
              key={l.label}
              className="flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold"
              initial={staged && !reduce ? { opacity: 0, y: 8 } : false}
              animate={landed ? { opacity: 1, y: 0 } : { opacity: 0, y: reduce ? 0 : 8 }}
              transition={{ duration: reduce ? 0.15 : 0.28, ease: OUT }}
            >
              {kind === "payment" ? <Bank size={15} weight="fill" color={TONE.payment} /> : <Scroll size={15} weight="fill" color={TONE.credit} />}
              {l.label} · {money(l.amount)}
              {reveal && l.residual > 0 && <span className="text-[var(--amber-deep)]">· {money(l.residual)} stays open</span>}
            </motion.span>
          );
        })}
        <span className="ml-auto flex items-center gap-2 text-sm font-bold">
          <span className="text-[var(--muted)]">Owed</span>
          <span
            className={`mono min-w-[4.5rem] rounded-lg border px-2 py-0.5 text-center text-lg transition-colors duration-200 ${reveal ? "border-transparent" : "border-dashed border-[var(--line)] text-[var(--muted)]"}`}
            aria-live="polite"
          >
            {reveal ? money(residual) : "?"}
          </span>
          {reveal && residual === s.residual && (
            <motion.span
              className="mono rounded-full bg-[var(--odoo-soft)] px-2.5 py-0.5 text-xs"
              initial={reduce ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, ease: OUT }}
            >
              {s.paymentState}
            </motion.span>
          )}
        </span>
      </div>
    </div>
  );
}
