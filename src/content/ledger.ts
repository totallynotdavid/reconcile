import { ch, exam, unverified } from "./build";
import type { Track } from "./types";

export const ledger: Track = {
  id: "ledger",
  title: "Ledger",
  summary: "Invoice, payment, reconciliation. Predict the residual and the state before the ledger shows it.",
  levels: [
    {
      id: "ledger-1",
      title: "Residual, not bookkeeping",
      brief: "Read what is still owed straight from the receivable line.",
      caveat: "One invoice, one currency, no taxes. Real receivable accounts hold many invoices at once.",
      cards: [
        { kind: "predict", id: "l1-p1", concept: "residual", scenario: "partial", why: "The payment is its own entry. Matching it against the receivable line creates one partial reconcile for the paid amount, and the residual drops by exactly that amount.", source: exam() },
        { kind: "predict", id: "l1-p2", concept: "residual", scenario: "partial", why: "Same mechanism, new figures. Nothing is recomputed from the payment total: the residual is what is left unmatched on the invoice's receivable line.", source: exam() },
        ch("l1-c1", "residual", "A posted customer invoice for 1000 gets one payment of 400. Which field already holds the 600 still owed, with no custom code?", "amount_residual on account.move", ["A custom Monetary field summing account.payment.amount", "amount_total minus the sum of payment_state", "amount_untaxed_signed"], "amount_residual is maintained by the reconciliation engine. A custom field would duplicate it and can drift.", exam()),
        ch("l1-c2", "reconcile-lines", "At the database level, which record carries the match between an invoice and its payment?", "account.partial.reconcile: one row per debit line, credit line and amount", ["account.payment, which stores the invoice ids", "account.move, through payment_state", "account.bank.statement.line"], "Reconciling pairs a debit line with a credit line on the same account. The invoice shows as paid because of that pairing, not the other way round.", exam()),
        { kind: "predict", id: "l1-p3", concept: "residual", scenario: "two-partials", why: "Each payment produces its own partial reconcile. When the last residual reaches zero and nothing else is open on the account, an account.full.reconcile groups the lines.", source: exam() },
      ],
    },
    {
      id: "ledger-2",
      title: "Payment states",
      brief: "Tell paid, partial and in_payment apart.",
      caveat: "in_payment depends on a bank statement matching the payment. The simulation reduces that to one flag.",
      cards: [
        { kind: "predict", id: "l2-p1", concept: "payment-state", scenario: "waiting-bank", why: "The residual is zero, but the payment sits on an outstanding account until a bank line matches it. The invoice reads in_payment until then.", source: unverified("17.0", "behavior of account.move.payment_state; not read in the documentation repo") },
        ch("l2-c1", "payment-state", "The residual of an invoice is 0 but payment_state is not 'paid'. What is the most likely cause?", "The payment is still waiting for its bank statement line, so the state is in_payment", ["The invoice is still in draft", "The residual field has not been recomputed because store=False", "The customer overpaid"], "Zero residual means the invoice is fully matched. paid additionally needs the payment itself to be reconciled with the bank.", unverified("17.0", "behavior of account.move.payment_state; not read in the documentation repo")),
        ch("l2-c2", "payment-state", "An invoice shows 'partial'. A 600 residual remains of 1000. Does that state ever need special handling in a custom field?", "No. The partial payment matched only its own amount, so the residual is already right", ["Yes, partial payments must be summed in a loop", "Yes, the state must be recomputed by a cron", "Yes, partial payments live on a different account"], "Exam answer: a partial payment reconciles for the amount paid and nothing more. Residual and state follow.", exam()),
        ch("l2-c3", "reconcile-lines", "When does Odoo create an account.full.reconcile?", "When all receivable lines in the matching group sum to zero", ["On every payment, next to the partial reconcile", "When payment_state becomes 'partial'", "Only when a credit note is posted"], "Partials record each match. The full reconcile ties the group together once nothing is left open.", exam()),
        { kind: "predict", id: "l2-p2", concept: "payment-state", scenario: "two-partials", why: "Two payments, two partial reconciles, then a full one when the residual hits zero.", source: exam() },
      ],
    },
    {
      id: "ledger-3",
      title: "Where the simple formula breaks",
      brief: "Credit notes, overpayments and a field that lies a little.",
      caveat: "Multi-currency adds a second residual in the company currency. The simulation has one currency.",
      cards: [
        { kind: "predict", id: "l3-p1", concept: "naive-collected", scenario: "credit-note", why: "A credit note is matched exactly like a payment. It lowers the residual, so amount_total minus amount_residual counts it as 'collected' even though no cash came in.", source: exam() },
        ch("l3-c1", "naive-collected", "Your field is total_cobrado = amount_total - amount_residual. A 1000 invoice gets a 250 credit note and a 300 payment. What does the field show, and what is wrong?", "550. It counts the credit note as money collected", ["300, which is correct", "550, which is correct", "1000, because the invoice is posted"], "The residual reacts to every reconciled line, not only cash. To report cash, sum matched amounts from payment lines.", exam()),
        { kind: "predict", id: "l3-p2", concept: "overpay", scenario: "overpay", why: "Only 1000 can match the invoice. The remaining 200 stays open on the payment line as a credit for the customer, so the receivable is not fully reconciled.", source: unverified("17.0", "the model's behavior; Odoo shows it as an outstanding credit") },
        ch("l3-c2", "overpay", "A customer pays 1200 against a 1000 invoice. How many partial reconciles exist and what happens to the 200?", "One for 1000. The 200 stays as open credit on the payment line", ["One for 1200, and the invoice residual becomes -200", "Two, one for 1000 and one for 200 against the same invoice", "None until someone refunds the 200"], "A match cannot exceed what is open on either side.", unverified("17.0", "the model's behavior; Odoo shows it as an outstanding credit")),
        ch("l3-c3", "multi-currency", "An invoice is in USD and the company currency is PEN. Which field is the residual in the invoice currency, and which is in the company currency?", "amount_residual is in the invoice currency; amount_residual_signed is in the company currency", ["Both are in the company currency", "amount_residual is signed PEN and amount_residual_signed is USD", "There is only one residual field"], "A report that mixes them double-converts or sums USD with PEN. Check which one a query reads.", unverified("17.0", "field semantics; not read in the documentation repo")),
      ],
    },
    {
      id: "ledger-4",
      title: "Model map",
      brief: "Know which model owns which fact.",
      caveat: "Names are from 17. Later versions moved some internals; check the version before copying a join.",
      cards: [
        ch("l4-c1", "reconcile-models", "In 17, how does account.payment hold its journal entry?", "It delegates to an account.move through _inherits on move_id", ["It stores debit and credit columns itself", "It has no entry; payments are lines on account.bank.statement", "It extends account.move.line"], "The user sees a payment, but accounting lives in the move. Exam answer, written for 17.", exam()),
        ch("l4-c2", "reconcile-models", "Which line of an invoice carries the residual that matters for collection?", "The receivable line, the one with display_type = 'payment_term'", ["The income line", "The tax line", "Any line; they all share the residual"], "Income and tax lines are not reconciled. The payment-term line is the one that gets matched.", exam()),
        ch("l4-c3", "reconcile-models", "Bank reconciliation must propose or apply matches by customer, amount or statement text. Which model configures that?", "account.reconcile.model", ["account.payment.term", "account.partial.reconcile", "ir.cron with a custom search"], "The reconcile model holds the rules. Statement lines arrive by import or sync, and a cron fires the rules.", exam()),
        ch("l4-c4", "reconcile-models", "Where does the bad-debt provision for uncollectible invoices live in core?", "It does not. You write your own cron and posting logic", ["account.reconcile.model has a provision rule", "It is a setting on the receivable account", "payment_state = 'provision'"], "Exam answer: provisions are not in core.", exam()),
      ],
    },
  ],
};
