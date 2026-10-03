"use client";
import { Bank, Receipt, Scroll } from "@phosphor-icons/react";
import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { Scene } from "@/learning/session";
import { money } from "@/learning/session";
import { settle } from "@/sim/ledger";

const TONE = { payment: "#1f9d6b", credit: "#4c7bd8" } as const;
const OUT = [0.23, 1, 0.32, 1] as const;
const MOVE = [0.65, 0, 0.35, 1] as const;

// Pixels. A token's travel distance depends on these, so every row has a fixed height.
const BAR = 44;
const GAP = 8;
const ROW = 32;
const TOKEN = 28;

// Seconds. The demo paces each match so the eye can follow it. The quiz uses
// the fast pace because the learner sees it on every card.
const PACE = {
  demo: { lead: 0.2, gap: 1.2, travel: 0.6, fill: 0.5 },
  quick: { lead: 0.05, gap: 0.4, travel: 0.25, fill: 0.2 },
} as const;

type PaceName = keyof typeof PACE;

/** How long the reveal takes, in milliseconds, for `matches` matched events. */
export function revealMs(matches: number, pace: PaceName = "demo") {
  const p = PACE[pace];
  return Math.round((p.lead + Math.max(0, matches - 1) * p.gap + p.travel + p.fill) * 1000);
}

/**
 * Applies the matches one at a time. `owed` steps down as each token lands on the
 * bar, and `done` flips once the last one has.
 */
function useReveal(total: number, amounts: number[], residual: number, reveal: boolean, pace: PaceName, instant: boolean) {
  const [owed, setOwed] = useState(total);
  const [done, setDone] = useState(false);

  useEffect(() => {
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
          running.push(animate(start, end, { duration: p.fill, ease: OUT, onUpdate: (v) => setOwed(Math.round(v)) }));
        }, (p.lead + i * p.gap + p.travel) * 1000),
      );
    });
    timers.push(setTimeout(() => setDone(true), revealMs(amounts.length, pace)));
    return () => {
      timers.forEach(clearTimeout);
      running.forEach((r) => r.stop());
    };
  }, [total, amounts, residual, reveal, pace, instant]);

  return { owed, done };
}

/**
 * The invoice as a bar, with one row per payment or credit note beneath it. Each
 * row keeps its token at the share of the bar it will cover. On reveal, the tokens
 * lift into the bar one at a time, and the owed amount steps down as each lands.
 * What stays hatched is what is owed.
 * `shown` is how many events have landed. Leave it out to show them all with no entrance.
 * `slots` reserves rows so the panel keeps its height when the scene changes.
 */
export function LedgerStage({ scene, reveal, shown, slots, live = true }: { scene: Scene; reveal: boolean; shown?: number; slots?: number; live?: boolean }) {
  const s = useMemo(() => settle(scene.total, scene.events), [scene]);
  const amounts = useMemo(() => s.partials.map((p) => p.amount), [s]);
  const reduce = useReducedMotion() ?? false;
  const staged = shown !== undefined;
  const pace: PaceName = staged ? "demo" : "quick";
  const { owed, done } = useReveal(scene.total, amounts, s.residual, reveal, pace, reduce);
  const p = PACE[pace];
  const lines = s.lines.slice(1);
  const rows = Math.max(slots ?? 0, lines.length);
  const matched = amounts.reduce((a, b) => a + b, 0);
  const stagger = (i: number) => p.lead + i * p.gap;
  const slot = (index: number) => {
    const before = s.partials.slice(0, index).reduce((a, b) => a + b.amount, 0);
    return { left: (before / scene.total) * 100, width: (s.partials[index].amount / scene.total) * 100 };
  };

  return (
    <div className="panel p-4 sm:p-5">
      <div className="grid grid-cols-[8.5rem_1fr] gap-x-3 sm:grid-cols-[9.5rem_1fr]">
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ height: BAR }}>
          <Receipt size={20} weight="duotone" className="shrink-0 text-[var(--odoo)]" />
          <span>Invoice</span>
          <motion.span key={scene.total} className="mono" initial={staged && !reduce ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
            {money(scene.total)}
          </motion.span>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-[var(--line)] hatch" style={{ height: BAR }}>
          {s.partials.map((part, i) => {
            const { left, width } = slot(i);
            const kind = part.credit.startsWith("Credit") ? "credit" : "payment";
            return (
              <motion.div
                key={`${scene.total}-${i}-${part.credit}`}
                className="absolute inset-y-0 grid place-items-center overflow-hidden text-xs font-bold text-white"
                style={{ left: `${left}%`, width: `${width}%`, background: TONE[kind] }}
                initial={false}
                animate={{ opacity: reveal ? 1 : 0 }}
                transition={{ duration: 0, delay: reveal && !reduce ? stagger(i) + p.travel : 0 }}
              >
                <span className="whitespace-nowrap">{width > 12 && money(part.amount)}</span>
              </motion.div>
            );
          })}
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

        {Array.from({ length: rows }, (_, i) => {
          const l = lines[i];
          const landed = !!l && (!staged || i < shown);
          const kind = l?.kind === "credit" ? "credit" : "payment";
          const index = l ? s.partials.findIndex((part) => part.credit === l.label) : -1;
          const at = index >= 0 ? slot(index) : null;
          const lift = -(BAR + GAP + i * ROW + TOKEN / 2 - BAR / 2);
          const top = i === 0 ? GAP : 0;
          return (
            <div key={`${scene.total}-${i}`} className="contents">
              <motion.div
                className="flex items-center gap-1.5 text-xs font-semibold"
                style={{ height: ROW, marginTop: top }}
                initial={staged && !reduce ? { opacity: 0 } : false}
                animate={{ opacity: landed ? 1 : 0 }}
                transition={{ duration: reduce ? 0.15 : 0.28, ease: OUT }}
              >
                {l && (
                  <>
                    {kind === "payment" ? <Bank size={15} weight="fill" color={TONE.payment} className="shrink-0" /> : <Scroll size={15} weight="fill" color={TONE.credit} className="shrink-0" />}
                    <span className="whitespace-nowrap">{l.label}</span>
                    <span className="mono ml-auto whitespace-nowrap text-[var(--muted)]">{money(l.amount)}</span>
                  </>
                )}
              </motion.div>
              <div className="relative" style={{ height: ROW, marginTop: top }}>
                {at && (
                  <motion.div
                    className="absolute top-0 z-10 grid place-items-center overflow-hidden rounded-md text-xs font-bold text-white shadow-sm"
                    style={{ left: `${at.left}%`, width: `${at.width}%`, height: TOKEN, background: TONE[kind] }}
                    initial={staged && !reduce ? { opacity: 0, y: 6 } : false}
                    animate={reveal ? (reduce ? { opacity: 0, y: 0 } : { y: lift, opacity: [1, 1, 0] }) : { opacity: landed ? 1 : 0, y: 0 }}
                    transition={
                      reveal && !reduce
                        ? { y: { duration: p.travel, delay: stagger(index), ease: MOVE }, opacity: { duration: p.travel, delay: stagger(index), times: [0, 0.97, 1] } }
                        : { duration: reduce ? 0.15 : 0.28, ease: OUT }
                    }
                  >
                    <span className="whitespace-nowrap">{at.width > 14 && money(s.partials[index].amount)}</span>
                  </motion.div>
                )}
              </div>
            </div>
          );
        })}

        <div className="col-span-2 mt-3 h-px bg-[var(--line)]" />
        <div className="flex items-center text-sm font-bold" style={{ height: 52 }}>
          Owed
        </div>
        <div className="flex items-center gap-3" style={{ height: 52 }}>
          <span
            className={`mono min-w-[5.5rem] rounded-lg border px-2 py-0.5 text-center text-lg font-bold transition-colors duration-200 ${reveal ? "border-transparent" : "border-dashed border-[var(--line)] text-[var(--muted)]"}`}
            aria-hidden
          >
            {reveal ? money(owed) : "?"}
          </span>
          <span className="mono rounded-full bg-[var(--odoo-soft)] px-2.5 py-0.5 text-xs transition-opacity duration-200" style={{ opacity: reveal && done ? 1 : 0 }} aria-hidden>
            {s.paymentState}
          </span>
          <span className="mono ml-auto hidden text-xs text-[var(--muted)] sm:block">amount_residual</span>
          {live && (
            <span className="sr-only" aria-live="polite">
              {reveal && done ? `Owed ${money(s.residual)}, ${s.paymentState}` : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
