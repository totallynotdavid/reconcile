import { describe, expect, it } from "vitest";
import { settle } from "./ledger";

describe("settle", () => {
  it("reproduces the exam case: 1000, pays 400, then 600", () => {
    const first = settle(1000, [{ type: "payment", amount: 400 }]);
    expect(first.residual).toBe(600);
    expect(first.paymentState).toBe("partial");
    expect(first.partials).toEqual([{ credit: "Payment 1", amount: 400 }]);
    expect(first.fullReconcile).toBe(false);

    const second = settle(1000, [
      { type: "payment", amount: 400 },
      { type: "payment", amount: 600 },
    ]);
    expect(second.residual).toBe(0);
    expect(second.paymentState).toBe("paid");
    expect(second.partials).toHaveLength(2);
    expect(second.fullReconcile).toBe(true);
  });

  it("matches an overpayment only up to the residual and keeps the rest as customer credit", () => {
    const s = settle(1000, [{ type: "payment", amount: 1200 }]);
    expect(s.residual).toBe(0);
    expect(s.paymentState).toBe("paid");
    expect(s.partials).toEqual([{ credit: "Payment 1", amount: 1000 }]);
    expect(s.openCredit).toBe(200);
    expect(s.fullReconcile).toBe(false);
  });

  it("reports in_payment until the bank statement matches the payment", () => {
    const s = settle(500, [{ type: "payment", amount: 500, bankReconciled: false }]);
    expect(s.residual).toBe(0);
    expect(s.paymentState).toBe("in_payment");
  });

  it("keeps an unreconciled payment out of in_payment while the invoice is still open", () => {
    const s = settle(500, [{ type: "payment", amount: 200, bankReconciled: false }]);
    expect(s.paymentState).toBe("partial");
  });

  it("counts a credit note as 'collected' under amount_total - amount_residual", () => {
    const s = settle(1000, [
      { type: "credit", amount: 250 },
      { type: "payment", amount: 300 },
    ]);
    expect(s.residual).toBe(450);
    expect(s.naiveCollected).toBe(550);
    expect(s.cashApplied).toBe(300);
  });

  it("marks an invoice reversed when only a credit note closes it", () => {
    const s = settle(1000, [{ type: "credit", amount: 1000 }]);
    expect(s.residual).toBe(0);
    expect(s.paymentState).toBe("reversed");
  });

  it("leaves an untouched invoice not_paid", () => {
    expect(settle(800, []).paymentState).toBe("not_paid");
  });
});
