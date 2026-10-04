"use client";
import { Bank, Receipt, Scroll } from "@phosphor-icons/react";
import { animate, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { Scene } from "@/learning/session";
import { money } from "@/learning/session";
import { settle } from "@/sim/ledger";

const TONE = { payment: "#1f9d6b", credit: "#4c7bd8" } as const;
const OUT = [0.23, 1, 0.32, 1] as const;
const SPRING = [0.34, 1.56, 0.64, 1] as const;
const FALL = [0.55, 0, 0.9, 0.55] as const;

// Pixels. A token falls from the tray into the bar, and its distance depends on
// these, so the tray and the card keep fixed sizes. Both have a 1px border and
// 14px side padding so a token and its segment share the same x.
const BAR = 44;
const GAP = 20;
const LIFT = BAR + 8 + 1 + GAP + 1 + 14;

// Seconds. The demo paces each match so the eye can follow it. The quiz uses
// the fast pace because the learner sees it on every card.
const PACE = {
  demo: { lead: 0.3, gap: 1.3, travel: 0.62, fill: 0.5 },
  quick: { lead: 0.05, gap: 0.4, travel: 0.3, fill: 0.2 },
} as const;

type PaceName = keyof typeof PACE;

/** How long the reveal takes, in milliseconds, for `matches` matched events. */
export function revealMs(matches: number, pace: PaceName = "demo") {
  const p = PACE[pace];
  return Math.round((p.lead + Math.max(0, matches - 1) * p.gap + p.travel + p.fill) * 1000);
}

/**
 * Applies the matches one at a time. `owed` steps down as each token lands on the
 * bar, `onHit` fires at each landing, and `done` flips once the last one has.
 */
function useReveal(total: number, amounts: number[], residual: number, reveal: boolean, pace: PaceName, instant: boolean, onHit: () => void) {
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
          onHit();
          running.push(animate(start, end, { duration: p.fill, ease: OUT, onUpdate: (v) => setOwed(Math.round(v)) }));
        }, (p.lead + i * p.gap + p.travel) * 1000),
      );
    });
    timers.push(setTimeout(() => setDone(true), revealMs(amounts.length, pace)));
    return () => {
      timers.forEach(clearTimeout);
      running.forEach((r) => r.stop());
    };
    // onHit is stable: it only starts animations on controls.
  }, [total, amounts, residual, reveal, pace, instant]);

  return { owed, done };
}

/**
 * A tray of received payments above the invoice. On reveal, each token drops into
 * the invoice bar at the share it settles. The card squashes on impact, the owed
 * amount steps down, and what stays hatched is what is owed.
 * `shown` is how many events have landed in the tray. Leave it out to show them all with no entrance.
 */
export function LedgerStage({ scene, reveal, shown, live = true }: { scene: Scene; reveal: boolean; shown?: number; live?: boolean }) {
  const s = useMemo(() => settle(scene.total, scene.events), [scene]);
  const amounts = useMemo(() => s.partials.map((p) => p.amount), [s]);
  const reduce = useReducedMotion() ?? false;
  const staged = shown !== undefined;
  const pace: PaceName = staged ? "demo" : "quick";
  const p = PACE[pace];
  const card = useAnimationControls();
  const value = useAnimationControls();
  const hit = () => {
    card.start({ scaleX: [1, 1.012, 1], scaleY: [1, 0.972, 1], transition: { duration: 0.4, times: [0, 0.3, 1], ease: [OUT, SPRING] } });
    value.start({ scale: [1, 1.18, 1], transition: { duration: 0.4, times: [0, 0.3, 1], ease: [OUT, SPRING] } });
  };
  const { owed, done } = useReveal(scene.total, amounts, s.residual, reveal, pace, reduce, hit);
  const lines = s.lines.slice(1);
  const matched = amounts.reduce((a, b) => a + b, 0);
  const land = (i: number) => p.lead + i * p.gap + p.travel;

  // Matched tokens sit above the part of the bar they fill. An unmatched one
  // (nothing left to settle) queues after them and stays in the tray.
  let spare = matched;
  const placed = lines.map((l) => {
    const index = s.partials.findIndex((part) => part.credit === l.label);
    if (index >= 0) {
      const before = s.partials.slice(0, index).reduce((a, b) => a + b.amount, 0);
      return { index, left: before, width: s.partials[index].amount };
    }
    const width = Math.min(l.amount, Math.max(0, scene.total - spare));
    const left = Math.min(spare, scene.total - width);
    spare += width;
    return { index: -1, left, width };
  });
  const pct = (n: number) => `${(n / scene.total) * 100}%`;

  return (
    <div className="panel p-4 sm:p-5">
      <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white/50 px-[14px] py-2">
        <div className="relative" style={{ height: BAR }}>
          {lines.map((l, i) => {
            const at = placed[i];
            const kind = l.kind === "credit" ? "credit" : "payment";
            const Icon = kind === "payment" ? Bank : Scroll;
            const landed = !staged || i < shown;
            const flies = at.index >= 0;
                        return (
              <motion.div
                key={`${scene.total}-${i}-${l.label}`}
                aria-label={`${l.label} ${money(l.amount)}`}
                className="absolute top-0 z-10 flex items-center justify-center gap-1.5 overflow-hidden rounded-lg text-xs font-bold text-white"
                style={{ left: pct(at.left), width: pct(at.width), height: BAR, background: TONE[kind], boxShadow: "0 3px 0 rgba(43,40,64,0.16)" }}
                initial={staged && !reduce ? { opacity: 0, y: -20, scaleX: 0.92, scaleY: 1.12 } : false}
                animate={
                  reveal && flies
                    ? reduce
                      ? { opacity: 0, y: 0, scaleX: 1, scaleY: 1 }
                      : { y: [0, -8, LIFT], scaleX: [1, 1.02, 0.98, 1], scaleY: [1, 0.96, 1.05, 1], opacity: [1, 1, 1, 0] }
                    : { opacity: landed ? (reveal && !flies ? 0.45 : 1) : 0, y: landed ? 0 : -20, scaleX: 1, scaleY: 1 }
                }
                transition={
                  reveal && flies && !reduce
                    ? {
                        y: { duration: p.travel, delay: p.lead + at.index * p.gap, times: [0, 0.2, 1], ease: [OUT, FALL] },
                        scaleX: { duration: p.travel, delay: p.lead + at.index * p.gap, times: [0, 0.2, 0.9, 1] },
                        scaleY: { duration: p.travel, delay: p.lead + at.index * p.gap, times: [0, 0.2, 0.9, 1] },
                        opacity: { duration: p.travel, delay: p.lead + at.index * p.gap, times: [0, 0.2, 0.98, 1] },
                      }
                    : { duration: reduce ? 0.15 : 0.45, ease: SPRING }
                }
              >
                <Icon size={16} weight="fill" className="shrink-0" />
                <span className="mono whitespace-nowrap">{money(l.amount)}</span>
              </motion.div>
            );
          })}
        </div>
      </div>

      <motion.div animate={card} className="rounded-2xl border border-[var(--line)] bg-white p-[14px]" style={{ transformOrigin: "50% 100%", marginTop: GAP }}>
        <div className="relative overflow-hidden rounded-xl border border-[var(--line)] hatch" style={{ height: BAR }}>
          {s.partials.map((part, i) => {
            const kind = part.credit.startsWith("Credit") ? "credit" : "payment";
            const before = s.partials.slice(0, i).reduce((a, b) => a + b.amount, 0);
            const width = (part.amount / scene.total) * 100;
            return (
              <motion.div
                key={`${scene.total}-${i}-${part.credit}`}
                className="absolute inset-y-0 grid place-items-center overflow-hidden text-xs font-bold text-white"
                style={{ left: pct(before), width: `${width}%`, background: TONE[kind] }}
                initial={false}
                animate={{ opacity: reveal ? 1 : 0 }}
                transition={{ duration: 0, delay: reveal && !reduce ? land(i) : 0 }}
              >
                <span className="whitespace-nowrap">{width > 12 && money(part.amount)}</span>
                <motion.span
                  className="absolute inset-0 bg-white"
                  initial={false}
                  animate={{ opacity: reveal && !reduce ? [0.7, 0] : 0 }}
                  transition={{ duration: 0.4, delay: land(i), ease: OUT }}
                />
              </motion.div>
            );
          })}
          {matched < scene.total && (
            <motion.span
              className="absolute inset-y-0 right-0 grid place-items-center text-xs font-bold text-[var(--amber-deep)]"
              style={{ left: pct(matched) }}
              initial={false}
              animate={{ opacity: reveal && done ? 1 : 0 }}
              transition={{ duration: reduce ? 0.15 : 0.25, ease: OUT }}
            >
              {money(s.residual)} open
            </motion.span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2" style={{ height: 40 }}>
          <Receipt size={20} weight="duotone" className="shrink-0 text-[var(--odoo)]" />
          <span className="text-sm font-semibold">Invoice</span>
          <motion.span key={scene.total} className="mono text-sm font-semibold" initial={staged && !reduce ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
            {money(scene.total)}
          </motion.span>
          <span className="ml-auto text-sm font-bold text-[var(--muted)]">Owed</span>
          <motion.span
            animate={value}
            className={`mono min-w-[5.5rem] rounded-lg border px-2 py-0.5 text-center text-lg font-bold transition-colors duration-200 ${reveal ? "border-transparent text-[var(--ink)]" : "border-dashed border-[var(--line)] text-[var(--muted)]"}`}
            aria-hidden
          >
            {reveal ? money(owed) : "?"}
          </motion.span>
          <span className="mono rounded-full bg-[var(--odoo-soft)] px-2.5 py-0.5 text-xs transition-opacity duration-200" style={{ opacity: reveal && done ? 1 : 0 }} aria-hidden>
            {s.paymentState}
          </span>
          {live && (
            <span className="sr-only" aria-live="polite">
              {reveal && done ? `Owed ${money(s.residual)}, ${s.paymentState}` : ""}
            </span>
          )}
        </div>
      </motion.div>
    </div>
  );
}
