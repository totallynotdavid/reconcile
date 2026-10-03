import { ch, map, src } from "./build";
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
        { kind: "predict", id: "l1-p1", concept: "residual", scenario: "partial", why: "The payment is its own entry. Matching it against the receivable line creates one partial reconcile for the paid amount, and the residual drops by exactly that amount.", source: src("18.0","addons/account/models/account_move_line.py (_prepare_reconciliation_partials)") },
        { kind: "predict", id: "l1-p2", concept: "residual", scenario: "partial", why: "Same mechanism, new figures. Nothing is recomputed from the payment total: the residual is what is left unmatched on the invoice's receivable line.", source: src("18.0","addons/account/models/account_move_line.py (_prepare_reconciliation_partials)") },
        ch("l1-c1", "residual", "A posted customer invoice for 1000 gets one payment of 400. Which field already holds the 600 still owed, with no custom code?", "amount_residual on account.move", ["A custom Monetary field summing account.payment.amount", "amount_total minus the sum of payment_state", "amount_untaxed_signed"], "amount_residual is maintained by the reconciliation engine. A custom field would duplicate it and can drift.", src("17.0","addons/account/models/account_move.py (_compute_amount)")),
        ch("l1-c2", "reconcile-lines", "At the database level, which record carries the match between an invoice and its payment?", "account.partial.reconcile: one row per debit line, credit line and amount", ["account.payment, which stores the invoice ids", "account.move, through payment_state", "account.bank.statement.line"], "Reconciling pairs a debit line with a credit line on the same account. The invoice shows as paid because of that pairing, not the other way round.", src("17.0","addons/account/models/account_partial_reconcile.py")),
        { kind: "predict", id: "l1-p3", concept: "residual", scenario: "two-partials", why: "Each payment produces its own partial reconcile. When the last residual reaches zero and nothing else is open on the account, an account.full.reconcile groups the lines.", source: src("18.0","addons/account/models/account_move_line.py (_prepare_reconciliation_partials)") },
      ],
    },
    {
      id: "ledger-2",
      title: "Payment states",
      brief: "Tell paid, partial and in_payment apart.",
      caveat: "in_payment needs the Enterprise accountant module; Community reports paid. From 18 the payment has its own state. The simulation reduces the bank match to one flag.",
      cards: [
        { kind: "predict", id: "l2-p1", concept: "payment-state", scenario: "waiting-bank", why: "The residual is zero, but the payment sits on an outstanding account until a bank line matches it. The invoice reads in_payment until then.", source: map("accounting", "17.0 to 19.0") },
        ch("l2-c1", "payment-state", "The residual of an invoice is 0 but payment_state is not 'paid'. What is the most likely cause?", "On Enterprise, the payment is still waiting for its bank statement line, so the state is in_payment", ["The invoice is still in draft", "The residual field has not been recomputed because store=False", "The customer overpaid"], "Zero residual means the invoice is fully matched. paid additionally needs the payment itself to be reconciled with the bank. Community has no in_payment and shows paid.", map("accounting", "17.0 to 19.0")),
        ch("l2-c2", "payment-state", "An invoice shows 'partial'. A 600 residual remains of 1000. Does that state ever need special handling in a custom field?", "No. The partial payment matched only its own amount, so the residual is already right", ["Yes, partial payments must be summed in a loop", "Yes, the state must be recomputed by a cron", "Yes, partial payments live on a different account"], "A partial payment reconciles for the amount paid and nothing more. Residual and state follow.", src("18.0","addons/account/models/account_move_line.py (_prepare_reconciliation_partials)")),
        ch("l2-c3", "reconcile-lines", "When does Odoo create an account.full.reconcile?", "When all receivable lines in the matching group sum to zero", ["On every payment, next to the partial reconcile", "When payment_state becomes 'partial'", "Only when a credit note is posted"], "Partials record each match. The full reconcile ties the group together once nothing is left open.", src("18.0","addons/account/models/account_move_line.py (_prepare_reconciliation_partials)")),
        ch("l2-c4", "payment-state", "On 19, which payment states exist on account.payment?", "draft, in_process, paid, canceled, rejected", ["draft, posted, sent, reconciled, cancel", "draft, open, paid, cancel", "posted, matched, voided"], "The 20 source adds reconciled and drops in_process, but the 20 docs still describe 19.", map("accounting", "18.0 to 19.0")),
        ch("l2-c5", "payment-state", "A 1000 invoice is cleared only by a 1000 credit note. No cash moved. What is payment_state?", "reversed", ["paid", "in_payment", "partial"], "No payment line is matched, so paid would claim cash that never came.", map("accounting", "19.0")),
        { kind: "predict", id: "l2-p2", concept: "payment-state", scenario: "two-partials", why: "Two payments, two partial reconciles, then a full one when the residual hits zero.", source: src("18.0","addons/account/models/account_move_line.py (_prepare_reconciliation_partials)") },
      ],
    },
    {
      id: "ledger-3",
      title: "Where the simple formula breaks",
      brief: "Credit notes, overpayments and a field that lies a little.",
      caveat: "Multi-currency adds a second residual in the company currency. The simulation has one currency.",
      cards: [
        { kind: "predict", id: "l3-p1", concept: "naive-collected", scenario: "credit-note", why: "A credit note is matched exactly like a payment. It lowers the residual, so amount_total minus amount_residual counts it as 'collected' even though no cash came in.", source: src("17.0","addons/account/models/account_move.py (_compute_amount)") },
        ch("l3-c1", "naive-collected", "Your field is total_cobrado = amount_total - amount_residual. A 1000 invoice gets a 250 credit note and a 300 payment. What does the field show, and what is wrong?", "550. It counts the credit note as money collected", ["300, which is correct", "550, which is correct", "1000, because the invoice is posted"], "The residual reacts to every reconciled line, not only cash. To report cash, sum matched amounts from payment lines.", src("17.0","addons/account/models/account_move.py (_compute_amount)")),
        { kind: "predict", id: "l3-p2", concept: "overpay", scenario: "overpay", why: "Only 1000 can match the invoice. The remaining 200 stays open on the payment line as a credit for the customer, so the receivable is not fully reconciled.", source: src("18.0","addons/account/models/account_move_line.py (_prepare_reconciliation_partials)") },
        ch("l3-c2", "overpay", "A customer pays 1200 against a 1000 invoice. How many partial reconciles exist and what happens to the 200?", "One for 1000. The 200 stays as open credit on the payment line", ["One for 1200, and the invoice residual becomes -200", "Two, one for 1000 and one for 200 against the same invoice", "None until someone refunds the 200"], "A match cannot exceed what is open on either side.", src("18.0","addons/account/models/account_move_line.py (_prepare_reconciliation_partials)")),
        ch("l3-c3", "multi-currency", "An invoice is in USD and the company currency is PEN. Which field is the residual in the invoice currency, and which is in the company currency?", "amount_residual is in the invoice currency; amount_residual_signed is in the company currency", ["Both are in the company currency", "amount_residual is signed PEN and amount_residual_signed is USD", "There is only one residual field"], "A report that mixes them double-converts or sums USD with PEN. Check which one a query reads. On the move line the roles flip: amount_residual is in the company currency and amount_residual_currency is in the invoice currency.", map("accounting", "17.0 to 19.0")),
      ],
    },
    {
      id: "ledger-4",
      title: "Model map",
      brief: "Know which model owns which fact.",
      caveat: "Names are from 17. Later versions moved some internals; check the version before copying a join.",
      cards: [
        ch("l4-c1", "reconcile-models", "In 17 and earlier, how does account.payment hold its journal entry?", "It delegates to an account.move through _inherits on move_id", ["It stores debit and credit columns itself", "It has no entry; payments are lines on account.bank.statement", "It extends account.move.line"], "The user sees a payment, but accounting lives in the move. This is the 17 model. In 18 and later the payment is its own model.", src("17.0","addons/account/models/account_payment.py (_inherits)")),
        ch("l4-c1b", "reconcile-models", "A 17 module reads payment.move_id.state to filter posted payments. What happens on 18?", "It breaks. account.payment has its own state and no longer inherits account.move", ["Nothing, move_id still drives the state", "The field is renamed but works", "Only the UI changes"], "Read payment.state. In 18 and 19 its values are draft, in_process, paid, canceled and rejected. The 20 source renames them again.", map("accounting", "18.0 to 20.0")),
        ch("l4-c2", "reconcile-models", "Which line of an invoice carries the residual that matters for collection?", "The receivable line, the one with display_type = 'payment_term'", ["The income line", "The tax line", "Any line; they all share the residual"], "Income and tax lines are not reconciled. The payment-term line is the one that gets matched.", src("17.0","addons/account/models/account_move_line.py (display_type)")),
        ch("l4-c3", "reconcile-models", "Bank reconciliation must propose or apply matches by customer, amount or statement text. Which model configures that?", "account.reconcile.model", ["account.payment.term", "account.partial.reconcile", "ir.cron with a custom search"], "The reconcile model holds the rules. Statement lines arrive by import or sync, and a cron fires the rules.", src("19.0","addons/account/models/account_reconcile_model.py")),
      ],
    },
  ],
};
