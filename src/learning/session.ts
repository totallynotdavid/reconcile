import type { Card, PredictScenario, TriageStep } from "@/content/types";
import { type LedgerEvent, type Settlement, settle } from "@/sim/ledger";

export type Prepared =
  | { card: Card; kind: "choice"; prompt: string; options: string[]; answer: number; trace?: string[] }
  | { card: Card; kind: "bug"; prompt: string; language: string; lines: string[]; answer: number }
  | { card: Card; kind: "triage"; prompt: string; steps: (TriageStep & { options: string[]; answer: number })[] };

/** mulberry32: small seeded generator so a session is repeatable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Shuffles options and returns where the correct one went. */
export function shuffleOptions(options: string[], answer: number, rand: () => number) {
  const order = options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { options: order.map((i) => options[i]), answer: order.indexOf(answer) };
}

export const money = (n: number) => n.toLocaleString("en-US");

const pick = (rand: () => number, min: number, max: number, step: number) =>
  min + step * Math.floor(rand() * ((max - min) / step + 1));

const unique = (list: string[]) => [...new Set(list)];

function describe(s: Settlement): string[] {
  const lines = s.lines.map((l) => `${l.label}: ${money(l.amount)}`);
  const matches = s.partials.map((p) => `${p.credit} matched ${money(p.amount)} against the invoice`);
  return [...lines, ...matches, `Invoice amount_residual: ${money(s.residual)}`, `payment_state: ${s.paymentState}`];
}

function predict(scenario: PredictScenario, rand: () => number) {
  const total = pick(rand, 600, 2400, 100);
  const events: LedgerEvent[] = [];

  switch (scenario) {
    case "partial": {
      const paid = pick(rand, 100, total - 100, 100);
      events.push({ type: "payment", amount: paid });
      const s = settle(total, events);
      const prompt = `A posted invoice for ${money(total)} receives one payment of ${money(paid)}. What is amount_residual?`;
      const correct = money(s.residual);
      const wrong = [money(total), money(paid), money(total + paid)];
      return { prompt, options: unique([correct, ...wrong]), trace: describe(s) };
    }
    case "two-partials": {
      const first = pick(rand, 100, total - 100, 100);
      events.push({ type: "payment", amount: first }, { type: "payment", amount: total - first });
      const s = settle(total, events);
      const prompt = `An invoice for ${money(total)} is paid in two payments: ${money(first)}, then ${money(total - first)}. What exists in the database afterwards?`;
      const correct = `${s.partials.length} partial reconciles and a full reconcile`;
      const wrong = [
        "1 partial reconcile and no full reconcile",
        `${s.partials.length} partial reconciles and no full reconcile`,
        "1 partial reconcile and a full reconcile",
      ];
      return { prompt, options: [correct, ...wrong], trace: describe(s) };
    }
    case "overpay": {
      const extra = pick(rand, 100, 500, 100);
      events.push({ type: "payment", amount: total + extra });
      const s = settle(total, events);
      const prompt = `A customer pays ${money(total + extra)} against an invoice for ${money(total)}. How much stays open as credit on the payment line?`;
      const correct = money(s.openCredit);
      const wrong = ["0", money(total), money(total + extra)];
      return { prompt, options: unique([correct, ...wrong]), trace: describe(s) };
    }
    case "credit-note": {
      const credit = pick(rand, 100, total / 2, 100);
      const pay = pick(rand, 100, total - credit - 100, 100);
      events.push({ type: "credit", amount: credit }, { type: "payment", amount: pay });
      const s = settle(total, events);
      const prompt = `An invoice for ${money(total)} gets a credit note of ${money(credit)} and then a payment of ${money(pay)}. What is amount_residual?`;
      const correct = money(s.residual);
      const wrong = [money(total - pay), money(total - credit), money(credit + pay)];
      return { prompt, options: unique([correct, ...wrong]), trace: describe(s) };
    }
    case "waiting-bank": {
      events.push({ type: "payment", amount: total, bankReconciled: false });
      const s = settle(total, events);
      const prompt = `An invoice for ${money(total)} is paid in full by a payment that no bank statement line has matched yet. What is payment_state?`;
      const correct = s.paymentState;
      const wrong = ["paid", "partial", "not_paid"];
      return { prompt, options: unique([correct, ...wrong]), trace: describe(s) };
    }
  }
}

export function prepare(card: Card, seed: number): Prepared {
  const rand = rng(hashSeed(card.id, seed));
  switch (card.kind) {
    case "choice": {
      const mixed = shuffleOptions(card.options, card.answer, rand);
      return { card, kind: "choice", prompt: card.prompt, ...mixed };
    }
    case "predict": {
      const p = predict(card.scenario, rand);
      const mixed = shuffleOptions(p.options, 0, rand);
      return { card, kind: "choice", prompt: p.prompt, ...mixed, trace: p.trace };
    }
    case "bug":
      return { card, kind: "bug", prompt: card.prompt, language: card.language, lines: card.lines, answer: card.answer };
    case "triage":
      return {
        card,
        kind: "triage",
        prompt: card.prompt,
        steps: card.steps.map((s) => ({ ...s, ...shuffleOptions(s.options, s.answer, rand) })),
      };
  }
}
