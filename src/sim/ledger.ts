/**
 * Receivable-account model for one customer invoice.
 *
 * Mirrors how Odoo reconciles in 17+: every payment or credit note is its own
 * journal entry with a credit line on the receivable account. Reconciling it
 * against the invoice's receivable line creates one account.partial.reconcile
 * for the matched amount. The model stops there: one invoice, one currency,
 * no taxes, no bank statements.
 */

export type LedgerEvent =
  | { type: "payment"; amount: number; bankReconciled?: boolean }
  | { type: "credit"; amount: number };

export type LineKind = "invoice" | "payment" | "credit";

export type Line = {
  kind: LineKind;
  label: string;
  /** Always positive. The side is implied by `kind`: the invoice debits, the rest credit. */
  amount: number;
  /** Unmatched part of the line. */
  residual: number;
  bankReconciled: boolean;
};

export type PartialReconcile = { credit: string; amount: number };

export type PaymentState = "not_paid" | "partial" | "in_payment" | "paid" | "reversed";

export type Settlement = {
  lines: Line[];
  partials: PartialReconcile[];
  /** account.move.amount_residual of the invoice. */
  residual: number;
  paymentState: PaymentState;
  /** True when every receivable line of the customer is matched to zero. */
  fullReconcile: boolean;
  /** Credit left on payment and credit-note lines after the invoice closed. */
  openCredit: number;
  /** The naive `amount_total - amount_residual`. */
  naiveCollected: number;
  /** Money that actually came in through payments. */
  cashApplied: number;
};

export function settle(total: number, events: LedgerEvent[]): Settlement {
  const invoice: Line = { kind: "invoice", label: "Invoice", amount: total, residual: total, bankReconciled: true };
  const lines: Line[] = [invoice];
  const partials: PartialReconcile[] = [];
  let payments = 0;
  let credits = 0;

  for (const event of events) {
    const n = lines.filter((l) => l.kind === event.type).length + 1;
    const label = event.type === "payment" ? `Payment ${n}` : `Credit note ${n}`;
    const line: Line = {
      kind: event.type,
      label,
      amount: event.amount,
      residual: event.amount,
      bankReconciled: event.type === "payment" ? (event.bankReconciled ?? true) : true,
    };
    lines.push(line);
    const matched = Math.min(invoice.residual, line.residual);
    if (matched > 0) {
      invoice.residual -= matched;
      line.residual -= matched;
      partials.push({ credit: label, amount: matched });
      if (event.type === "payment") payments += matched;
      else credits += matched;
    }
  }

  const openCredit = lines.filter((l) => l.kind !== "invoice").reduce((sum, l) => sum + l.residual, 0);
  return {
    lines,
    partials,
    residual: invoice.residual,
    paymentState: stateOf(total, invoice.residual, lines, payments, credits),
    fullReconcile: invoice.residual === 0 && openCredit === 0,
    openCredit,
    naiveCollected: total - invoice.residual,
    cashApplied: payments,
  };
}

function stateOf(total: number, residual: number, lines: Line[], payments: number, credits: number): PaymentState {
  if (residual === total) return "not_paid";
  if (residual > 0) return "partial";
  if (payments === 0 && credits > 0) return "reversed";
  const waitingForBank = lines.some((l) => l.kind === "payment" && !l.bankReconciled && l.amount > l.residual);
  return waitingForBank ? "in_payment" : "paid";
}
