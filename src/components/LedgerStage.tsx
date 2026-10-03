"use client";
import { Bank, Receipt, Scroll } from "@phosphor-icons/react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { Scene } from "@/learning/session";
import { money } from "@/learning/session";
import { settle } from "@/sim/ledger";

const TONE = { payment: "#1f9d6b", credit: "#4c7bd8" } as const;
const OUT = [0.23, 1, 0.32, 1] as const;

// Seconds. The demo paces each match so the eye can follow it. The quiz uses
// the fast pace because the learner sees it on every card.
const PACE = {
  demo: { lead: 0.2, gap: 0.95, fill: 0.7 },
  quick: { lead: 0.05, gap: 0.3, fill: 0.28 },
} as const;

/** How long the reveal takes, in milliseconds, for `matches` matched events. */
export function revealMs(matches: number, pace: keyof typeof PACE = "demo") {
  const p = PACE[pace];
  return Math.round((p.lead + Math.max(0, matches - 1) * p.gap + p.fill) * 1000);
}

/**
 * Applies the matches one at a time. `owed` steps down with each match, `active`
 * names the match in flight, and `done` flips once the last one lands.
 */
function useReveal(total: number, amounts: number[], residual: number, reveal: boolean, pace: keyof typeof PACE, instant: boolean) {
  const [owed, setOwed] = useState(total);
  const [active, setActive] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setActive(null);
    if (!reveal || instant || amounts.length === 0) {
      setOwed(reveal ? residual : total);
      setDone(reveal);
      return;
    }
    setOwed(total);
    setDone(false);
    const p = PACE[pace];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const running: { stop: () => void }[] = [];
    let from = total;
    amounts.forEach((amount, i) => {
      const start = from;
      const end = i === amounts.length - 1 ? residual : start - amount;
      from = end;
      timers.push(
        setTimeout(() => {
          setActive(i);
          running.push(animate(start, end, { duration: p.fill, ease: OUT, onUpdate: (v) => setOwed(Math.round(v)) }));
        }, (p.lead + i * p.gap) * 1000),
      );
    });
    timers.push(setTimeout(() => (setActive(null), setDone(true)), revealMs(amounts.length, pace)));
    return () => {
      timers.forEach(clearTimeout);
      running.forEach((r) => r.stop());
    };
  }, [total, amounts, residual, reveal, pace, instant]);

  return { owed, active, done };
}

/**
 * The invoice as a bar. Before the answer, the events sit beside it and the owed
 * amount is a question. On reveal, each event in turn fills its share of the bar
 * while the owed amount steps down by the same amount. What stays hatched is what is owed.
 * `shown` is how many events have landed. Leave it out to show them all with no entrance.
 */
export function LedgerStage({ scene, reveal, shown, live = true }: { scene: Scene; reveal: boolean; shown?: number; live?: boolean }) {
  const s = useMemo(() => settle(scene.total, scene.events), [scene]);
  const amounts = useMemo(() => s.partials.map((p) => p.amount), [s]);
  const reduce = useReducedMotion() ?? false;
  const staged = shown !== undefined;
  const pace = staged ? "demo" : "quick";
  const { owed, active, done } = useReveal(scene.total, amounts, s.residual, reveal, pace, reduce);
  const p = PACE[pace];
  const kindOf = (label: string) => (label.startsWith("Credit") ? "credit" : "payment");
  const lines = s.lines.slice(1);
  const matched = amounts.reduce((a, b) => a + b, 0);
  let offset = 0;

  return (
    <div className="panel p-4 sm:p-5">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span className="flex items-center gap-2">
          <Receipt size={20} weight="duotone" className="text-[var(--odoo)]" />
          Invoice{" "}
          <motion.span key={scene.total} className="mono" initial={staged && !reduce ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
            {money(scene.total)}
          </motion.span>
        </span>
        <span className="mono text-xs text-[var(--muted)]">amount_residual</span>
      </div>

      <div className="relative mt-3 h-11 overflow-hidden rounded-xl border border-[var(--line)] hatch">
        <AnimatePresence initial={false}>
          {s.partials.map((part, i) => {
            const left = (offset / scene.total) * 100;
            const width = (part.amount / scene.total) * 100;
            offset += part.amount;
            return (
              <motion.div
                key={`${scene.total}-${i}-${part.credit}`}
                className="absolute inset-y-0 grid place-items-center overflow-hidden text-xs font-bold text-white"
                style={{ left: `${left}%`, width: `${width}%`, background: TONE[kindOf(part.credit)] }}
                initial={false}
                animate={{ clipPath: reveal ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)", opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={reveal && !reduce ? { duration: p.fill, delay: p.lead + i * p.gap, ease: OUT } : { duration: 0 }}
              >
                <span className="whitespace-nowrap">{reveal && width > 12 && money(part.amount)}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {matched < scene.total && (
          <motion.span
            className="absolute inset-y-0 right-0 grid place-items-center text-xs font-bold text-[var(--amber-deep)]"
            style={{ left: `${(matched / scene.total) * 100}%` }}
            initial={false}
            animate={{ opacity: reveal && done ? 1 : 0 }}
            transition={{ duration: reduce ? 0.15 : 0.25, ease: OUT }}
          >
            {money(s.residual)} open
          </motion.span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <AnimatePresence initial={false}>
          {lines.map((l, i) => {
            const kind = l.kind === "credit" ? "credit" : "payment";
            const landed = !staged || i < shown;
            const matching = active !== null && s.partials[active]?.credit === l.label;
            return (
              landed && (
                <motion.span
                  key={`${scene.total}-${i}-${l.label}`}
                  className="flex items-center gap-1.5 rounded-full border bg-white px-3 py-1 text-xs font-semibold"
                  initial={staged && !reduce ? { opacity: 0, y: 8 } : false}
                  animate={{ opacity: 1, y: 0, borderColor: matching ? TONE[kind] : "var(--line)" }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  transition={{ duration: reduce ? 0.15 : 0.28, ease: OUT }}
                >
                  {kind === "payment" ? <Bank size={15} weight="fill" color={TONE.payment} /> : <Scroll size={15} weight="fill" color={TONE.credit} />}
                  {l.label} · {money(l.amount)}
                </motion.span>
              )
            );
          })}
        </AnimatePresence>
        <span className="ml-auto flex items-center gap-2 text-sm font-bold">
          <span className="text-[var(--muted)]">Owed</span>
          <span
            className={`mono min-w-[4.5rem] rounded-lg border px-2 py-0.5 text-center text-lg transition-colors duration-200 ${reveal ? "border-transparent" : "border-dashed border-[var(--line)] text-[var(--muted)]"}`}
            aria-hidden
          >
            {reveal ? money(owed) : "?"}
          </span>
          {live && (
            <span className="sr-only" aria-live="polite">
              {reveal && done ? `Owed ${money(s.residual)}, ${s.paymentState}` : ""}
            </span>
          )}
          {reveal && done && (
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
