import { describe, expect, it } from "vitest";
import { ALL_CARDS } from "@/content";
import type { PredictCard, TriageCard } from "@/content/types";
import { settle } from "@/sim/ledger";
import { prepare } from "./session";

const predictCards = ALL_CARDS.filter((c): c is PredictCard => c.kind === "predict");

describe("prepare", () => {
  it("keeps the correct option on the answer index after shuffling", () => {
    for (const card of ALL_CARDS) {
      if (card.kind !== "choice") continue;
      for (let seed = 0; seed < 5; seed++) {
        const p = prepare(card, seed);
        if (p.kind !== "choice") throw new Error("expected choice");
        expect(p.options[p.answer]).toBe(card.options[card.answer]);
        expect(new Set(p.options).size).toBe(p.options.length);
      }
    }
  });

  it("gives the same card the same layout for the same seed", () => {
    const card = ALL_CARDS.find((c) => c.kind === "choice")!;
    expect(prepare(card, 3)).toEqual(prepare(card, 3));
  });

  it("makes every predict card's right answer agree with the ledger", () => {
    expect(predictCards.length).toBeGreaterThan(5);
    for (const card of predictCards) {
      for (let seed = 0; seed < 25; seed++) {
        const p = prepare(card, seed);
        if (p.kind !== "choice") throw new Error("expected choice");
        expect(p.options.length).toBeGreaterThanOrEqual(3);
        const trace = p.trace!.join("\n");
        const residual = /amount_residual: ([\d,]+)/.exec(trace)![1];
        const state = /payment_state: (\w+)/.exec(trace)![1];
        const chosen = p.options[p.answer];
        if (card.scenario === "partial" || card.scenario === "credit-note") expect(chosen).toBe(residual);
        if (card.scenario === "waiting-bank") expect(chosen).toBe(state);
        if (card.scenario === "waiting-bank") expect(state).toBe("in_payment");
      }
    }
  });

  it("brings new figures when the seed changes", () => {
    const card = predictCards.find((c) => c.scenario === "partial")!;
    const prompts = new Set(Array.from({ length: 12 }, (_, i) => (prepare(card, i) as { prompt: string }).prompt));
    expect(prompts.size).toBeGreaterThan(3);
  });

  it("shuffles each triage step without losing its answer", () => {
    const card = ALL_CARDS.find((c): c is TriageCard => c.kind === "triage")!;
    const p = prepare(card, 9);
    if (p.kind !== "triage") throw new Error("expected triage");
    p.steps.forEach((s, i) => expect(s.options[s.answer]).toBe(card.steps[i].options[0]));
  });

  it("reads a payment with no bank match as in_payment through the ledger", () => {
    expect(settle(900, [{ type: "payment", amount: 900, bankReconciled: false }]).paymentState).toBe("in_payment");
  });
});
