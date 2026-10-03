# Accounting in Odoo 16 to 20

Sources: odoo/documentation (16.0 to 20.0) and, where the docs are silent, odoo/odoo source (marked "source"). Citation form: [branch path (symbol)]. Doc paths are under `content/applications/finance/accounting/`. Source paths are under `addons/account/`.

## Summary (Odoo 19/20)

1. Every accounting fact lands in `account.move` (state draft, posted, cancel) made of `account.move.line` rows.
2. An invoice's payment status is `payment_state`, computed from `account.partial.reconcile` rows on its receivable/payable lines.
3. Reconciling matches debit and credit lines. Partial matches create `account.partial.reconcile`. A fully cleared set gets one `account.full.reconcile`.
4. Since 18, `account.payment` has its own `state` and no longer inherits `account.move`. The journal entry (`move_id`) is optional.
5. In 18/19 payment states are draft, in_process, paid, canceled, rejected. In 20 they are draft, paid, reconciled, canceled, rejected (source).
6. `in_payment` on the invoice needs the Enterprise accountant module. Community returns `paid` (source).
7. Bank statement lines are moves (`_inherits`). A suspense line stands in until the line is reconciled.
8. Foreign-currency reconciliation creates an exchange difference entry in the company's exchange journal.
9. Lock dates since 18: global, tax, sale, purchase, hard, plus per-user exceptions in `account.lock_exception`.
10. Reversal creates a credit note. Names follow journal sequence rules (`INV/2026/00001`, `RINV/...`, `PAY/...`).

---

## 1. Core models: account.move, account.move.line, account.payment, account.partial.reconcile, account.full.reconcile

**What it is.** `account.move` is the journal entry and the base of invoices, bills, and statement lines. `account.move.line` holds debit/credit rows. `account.partial.reconcile` links one debit line to one credit line for an amount. `account.full.reconcile` groups the partials once everything nets to zero.

**How it works.**
1. `account.move.move_type`: entry, out_invoice, out_refund, in_invoice, in_refund, out_receipt, in_receipt. [19.0 addons/account/models/account_move.py `move_type`] (source)
2. Lines carry `balance` (company currency), `amount_currency`, `currency_id`, `amount_residual`, `amount_residual_currency`, `reconciled`, `matching_number`, `full_reconcile_id` (label "Matching"). [20.0 addons/account/models/account_move_line.py] (source)
3. `matching_number` is "P" for partial, the full reconcile name for full, "I..." for imports. [20.0 addons/account/models/account_move_line.py `_reconcile_marked`] (source)
4. Partial fields: `debit_move_id`, `credit_move_id`, `full_reconcile_id`, `exchange_move_id`, `amount`, `debit_amount_currency`, `credit_amount_currency`, `debit_currency_id`, `credit_currency_id`, `company_id`, `max_date`. [19.0 addons/account/models/account_partial_reconcile.py] (source)
5. `max_date` is used by aged reports. 19/20 add `draft_caba_move_vals` (Json) so draft entries can be reconciled. [19.0 addons/account/models/account_partial_reconcile.py] (source)
6. `account.full.reconcile` has `partial_reconcile_ids` and `reconciled_line_ids`. [20.0 addons/account/models/account_full_reconcile.py] (source)
7. Entry point is `account.move.line.reconcile()`. It runs `_prepare_reconciliation_plan`, `_reconcile_plan`, `_reconcile_plan_with_sync`. [17.0 addons/account/models/account_move_line.py] (source)
8. `_check_amls_exigibility_for_reconciliation` rejects lines already reconciled, on cancelled entries, on different accounts, or in different company roots. [20.0 addons/account/models/account_move_line.py] (source)
9. Unlinking a partial reverses or unlinks its CABA and exchange entries and removes the full reconcile. [20.0 addons/account/models/account_partial_reconcile.py `unlink`] (source)

**Where it breaks.**
- Lines on different accounts cannot reconcile. A wrong account on a payment blocks matching.
- Unreconciling an entry with an exchange move under a lock date forces the reversal date past the lock. [20.0 addons/account/models/account_partial_reconcile.py] (source)
- A reconcilable account is required (`reconcile=True`) for the line to be matched.

**By version.**

| Version | Change | Citation |
|---|---|---|
| 16 | Engine: `reconcile()`, `_prepare_reconciliation_partials`, `_create_exchange_difference_move`. `matching_number` already stored. | [16.0 addons/account/models/account_move_line.py] (source) |
| 17 | Rewritten: `_prepare_reconciliation_plan`, `_reconcile_plan`, `_prepare_reconciliation_single_partial`, `_create_exchange_difference_moves`, `_reconcile_pre_hook`/`_post_hook`. | [17.0 addons/account/models/account_move_line.py] (source) |
| 18 | Payment loses `_inherits` of `account.move`. | [18.0 addons/account/models/account_payment.py] (source) |
| 19 | `draft_caba_move_vals` on partial. Draft entries can be reconciled. Posting such a move also posts its draft exchange and CABA moves. | [19.0 addons/account/models/account_partial_reconcile.py] (source); [19.0 addons/account/models/account_move.py `_post`] (source); [19.0 bank/reconciliation.rst (note on draft entries)] | [corrected]
| 20 | no change found (the 19 draft-posting logic is still in `_post`). | [20.0 addons/account/models/account_move.py `_post`] (source) | [corrected]

**How to check.** Accounting > Reporting > Journal Items, group by "Matching", or shell: `env['account.partial.reconcile'].search([('debit_move_id','=',line_id)])`.

**Question seeds.**
1. Scenario: A customer paid 600 against a 1,000 invoice. The consultant expects one `account.full.reconcile`. Answer: There is one `account.partial.reconcile` for 600 and the matching number is "P". A full reconcile appears only when all lines net to zero. Wrong answer: A full reconcile with a 400 write-off. It fails because no write-off is created without a reconcile model or manual action.
2. Scenario: A client asks why two lines on different accounts will not match in the reconcile screen. Both have the same partner. Answer: Matching needs the same account. Wrong answer: Set the same partner. A shared partner does not override the account rule in `_check_amls_exigibility_for_reconciliation`.
3. Scenario: A report needs "when was the invoice settled". The team picks the payment date. Answer: `max_date` on the partials (latest of the two line dates). Wrong answer: `write_date` of the payment. It fails because it changes on any edit.
4. Scenario: A user unreconciles a payment matched in a locked month that had an exchange difference. Answer: The exchange entry is reversed, with the date moved after the lock. Wrong answer: It is deleted. It fails because posted entries under a lock cannot be unlinked, so `unlink` reverses them.

---

## 2. Payment state: payment_state values, in_payment, reversed

**What it is.** `payment_state` on `account.move` summarizes how paid an invoice is. Values: not_paid, in_payment, paid, partial, reversed, blocked, invoicing_legacy. [20.0 addons/account/models/account_move.py `payment_state`] (source)

**How it works.**
1. `_compute_payment_state` runs SQL over `account.partial.reconcile` joined to the counterpart move's payment or statement line, on receivable/payable lines. [17.0 addons/account/models/account_move.py `_compute_payment_state`] (source)
2. Residual zero and a payment or statement line exists: all payments `is_matched` gives `paid`, otherwise `_get_invoice_in_payment_state()`. (source)
3. Residual zero and no payment: `paid`, or `reversed` if only credit notes (and entries) of the opposite type matched it. in_invoice/in_receipt by in_refund; out_invoice/out_receipt by out_refund; entry/refunds by entry. (source)
4. Residual non-zero with partials: `partial`. (source)
5. `_get_invoice_in_payment_state()` returns 'paid' in community. Its docstring says the accountant module overrides it to enable `in_payment`. [19.0 addons/account/models/account_move.py `_get_invoice_in_payment_state`] (source)
6. `account.payment.create` checks `_get_invoice_in_payment_state() == 'in_payment'` to know if accounting is installed. [19.0 addons/account/models/account_payment.py `create`] (source)
7. UI label: Odoo shows "In Payment" when the payment is recorded but not yet bank-matched. [19.0 payments.rst]

**Where it breaks.**
- `in_payment` never appears on a community database. Training and tests written on Enterprise fail there.
- `reversed` appears only when the invoice was cleared by a credit note and no payment. A credit note plus refund payment gives `paid`.
- The override code is not public, so Enterprise behavior is not verified here.

**By version.**

| Version | Change | Citation |
|---|---|---|
| 16 | Only posted invoices qualify. | [16.0 addons/account/models/account_move.py `_compute_payment_state`] (source) |
| 17 | no change found. `blocked` and `_compute_status_in_payment` are not in the 17 file. | [17.0 addons/account/models/account_move.py] (source) | [corrected]
| 18 | Adds `blocked` and `_compute_status_in_payment`. SQL joins `origin_payment_id`. Payments without a move count via `matched_payment_ids` with state in_process or paid. | [18.0 addons/account/models/account_move.py] (source) | [corrected]
| 19 | `_invoice_qualifies`: drafts with non-zero `amount_total` also get a payment_state. `status_in_payment` depends on `is_move_sent`. | [19.0 addons/account/models/account_move.py] (source) |
| 20 | Payment state names shift (in_process becomes paid, paid becomes reconciled) in the compute. | [20.0 addons/account/models/account_move.py `_compute_payment_state`] (source) |

**How to check.** List view of invoices, group by "Payment Status". Shell: `env['account.move'].browse(id).payment_state`.

**Question seeds.**
1. Scenario: A community client records a bank payment and expects "In Payment" until the statement is imported. The invoice shows Paid. Answer: Community returns `paid` from the hook; `in_payment` needs Enterprise. Wrong answer: The journal's outstanding account is missing. It fails because that setting changes the entry, not the hook result.
2. Scenario: An invoice is cleared by a full credit note, no cash moved. A manager wants it counted as collected. Answer: `payment_state` is `reversed`, not `paid`. Wrong answer: It is `paid` because the residual is zero. It fails because no payment line is matched and the counterpart types are refunds.
3. Scenario: A draft invoice shows a payment state in 19 after a customer prepaid. Consultant calls it a bug. Answer: 19 computes it for drafts with a non-zero total (`_invoice_qualifies`). Wrong answer: Only posted invoices ever carry it. That was true in 16/17 only.
4. Scenario: A bill is matched by a bill refund and then a payment of the net. Answer: The match set decides: with a payment present the state follows `is_matched` of payments, else `paid`/`reversed` by counterpart types. Wrong answer: Always `reversed` once any refund exists. It fails because the rule needs only refunds as counterparts.

---

## 3. amount_residual vs amount_residual_signed

**What it is.** Both fields are the unpaid amount of an invoice. `amount_residual` is in the document currency and positive. `amount_residual_signed` is in company currency and carries the balance sign.

**How it works.**
1. `direction_sign` is 1 for entry or outbound types, else -1. [16.0 addons/account/models/account_move.py `_compute_direction_sign`] (source)
2. 16: `amount_residual = -sign * total_residual_currency`; `amount_residual_signed = total_residual`, summed over payment_term lines. [16.0 addons/account/models/account_move.py `_compute_amount`] (source)
3. Signed sign: customer invoice +, bill -, credit notes opposite. (source)
4. 20: `amount_residual = tax_totals['total_amount_currency'] + sign * total_reconciled_currency`; `amount_residual_signed = -sign * tax_totals['total_amount'] - total_reconciled`, with `total_reconciled += line.balance - line.amount_residual`. [20.0 addons/account/models/account_move.py `_compute_amount`] (source)
5. On `account.move.line`, `amount_residual` is company currency and `amount_residual_currency` is line currency. Both are stored; `reconciled` is True when both are zero. [20.0 addons/account/models/account_move_line.py] (source)

**Where it breaks.**
- Same name, different meaning: on the move it is document currency; on the line it is company currency.
- Summing `amount_residual` across currencies is meaningless. Use `_signed`.
- Bills have negative `_signed`. A filter `> 0` drops them.
- In 20 a draft invoice has a residual (computed from totals), in 16 it does not.

**By version.**

| Version | Change | Citation |
|---|---|---|
| 16 | Residual summed from payment_term lines. | [16.0 addons/account/models/account_move.py `_compute_amount`] (source) |
| 17 | no change found in the fields' meaning | [17.0 addons/account/models/account_move.py] (source) |
| 18 | no change found in the fields' meaning | [18.0 addons/account/models/account_move.py] (source) |
| 19 | no change found in the fields' meaning (drafts get payment_state; see topic 2) | [19.0 addons/account/models/account_move.py] (source) |
| 20 | Computed from `tax_totals` minus reconciled amounts, so drafts have a residual. | [20.0 addons/account/models/account_move.py `_compute_amount`] (source) |

Note: 17, 18, 19 were checked only by the payment-state diff, not line by line. See Doubts.

**How to check.** Invoice list, enable columns "Amount Due" and "Amount Due Signed" (dev mode), or shell: `move.amount_residual, move.amount_residual_signed`.

**Question seeds.**
1. Scenario: A USD bill on a EUR company shows `amount_residual` 500 and `amount_residual_signed` -460. A user says the values contradict. Answer: One is USD positive, one is EUR with balance sign. Wrong answer: One is stale. They are different fields by design.
2. Scenario: A dashboard sums `amount_residual` of all open invoices of a multi-currency company. Answer: Wrong total; sum `amount_residual_signed` for one currency base. Wrong answer: It works since both are "residual". Fails because currencies mix.
3. Scenario: A report filters `amount_residual_signed > 0` for "money owed". Bills are missing from payables. Answer: Bills are negative; use the sign or move_type. Wrong answer: Bills have residual 0. They do not.
4. Scenario: A line-level report uses `amount_residual` on lines for a USD invoice line. Answer: It is in company currency; use `amount_residual_currency` for USD. Wrong answer: It is USD like the move field. It fails because line residual is company currency.

---

## 4. account.payment and its states

**What it is.** `account.payment` records money in or out and links to invoices through its journal entry. In 18+ it is a standalone model with its own `state`.

**How it works.**
1. 16/17: `_inherits = {'account.move': 'move_id'}`. State is the move state (draft/posted/cancel). `action_post` calls `move_id._post(soft=False)`. [17.0 addons/account/models/account_payment.py] (source)
2. 18/19: own `state`: draft, in_process, paid, canceled, rejected. `move_id` is optional. `action_post` sets in_process, or paid when the outstanding account is `asset_cash`. `action_validate` sets paid. `action_reject` sets rejected. `action_cancel` sets canceled. [19.0 addons/account/models/account_payment.py] (source)
3. 18/19 `_compute_state`: in_process becomes paid when the liquidity line residual is zero, the liquidity account is not reconcilable, or all reconciled invoices are `paid`. (source)
4. 20: states draft, paid, reconciled, canceled, rejected. `action_post` sets paid. `action_validate` raises if `outstanding_account_type == 'asset_cash'` or the state is not paid; else sets reconciled. `outstanding_account_type` is a related field new in 20. [20.0 addons/account/models/account_payment.py] (source)
5. `is_matched`: with no outstanding account, `state == 'paid'` (18/19) or `'reconciled'` (20). (source)
6. Outstanding accounts come from the payment method line (`payment_method_line_id.payment_account_id`) and `outstanding_account_id`. If blank, no entry is created. [19.0 get_started/journals.rst]
7. Docs 18/19 `payments.rst` have two tabs: "Without outstanding accounts" (no entry, Amount Due not updated, paid after bank reconciliation) and "Using outstanding accounts". [19.0 payments.rst]
8. Context key `force_payment_move` forces an outstanding account (19/20). Community without accounting forces one so an entry exists. [19.0 addons/account/models/account_payment.py] (source)

**Where it breaks.**
- Scripts that read `payment.move_id.state` or `payment.date` via `_inherits` fail in 18+.
- Docs 19/20 still say "In payment" and do not describe the 20 names. Treat docs as behind source. [20.0 payments.rst]
- A payment on a main bank account (asset_cash) is paid at once and cannot be validated in 20.

**By version.**

| Version | Change | Citation |
|---|---|---|
| 16 | Inherits move. Always creates an entry with outstanding account. | [16.0 payments.rst]; [16.0 addons/account/models/account_payment.py] (source) |
| 17 | no change found | [17.0 addons/account/models/account_payment.py] (source) |
| 18 | Own state, optional move, `action_reject`, `is_sent`. | [18.0 addons/account/models/account_payment.py] (source); [18.0 payments.rst] |
| 19 | `force_payment_move`; the unmatched index is now declared as `_unmatched_idx` (18 already had `account_payment_unmatched_idx`). | [19.0 addons/account/models/account_payment.py] (source); [18.0 addons/account/models/account_payment.py] (source) | [corrected]
| 20 | States renamed (paid, reconciled), `outstanding_account_type`, validate guard. | [20.0 addons/account/models/account_payment.py] (source) |

**How to check.** Accounting > Customers > Payments, group by Status. Shell: `env['account.payment'].search([]).mapped('state')`.

**Question seeds.**
1. Scenario: Migrating a 17 script that reads `payment.state == 'posted'`. It returns nothing in 18. Answer: 18 uses in_process/paid; update the filters. Wrong answer: Payments are not posted any more. Posting still exists via `action_post`, the values differ.
2. Scenario: A client wants invoices to flip to Paid only after bank matching in 19 Community. Answer: Use an outstanding account on the method line; community still reports `paid` on invoices (no in_payment). Wrong answer: Set outstanding and get "In Payment". Fails because hook returns paid.
3. Scenario: In 20, a user clicks Validate on a payment on a cash-type main bank account. Answer: Error: payments linked to Asset Cash cannot be reconciled. Wrong answer: It moves to reconciled. The guard raises.
4. Scenario: A payment in 19 has no outstanding account. The client asks where its journal entry is. Answer: None is created; the invoice amount due is not updated until bank reconciliation. Wrong answer: A hidden entry exists. The docs say no entry is created.

---

## 5. Multi-currency and exchange differences

**What it is.** Each line holds company-currency `balance` and foreign `amount_currency`. When matched lines have different rates, an exchange difference entry books the gain or loss.

**How it works.**
1. `_prepare_reconciliation_single_partial` picks `recon_currency`: the shared foreign currency if both lines have it, else company currency. Context `no_exchange_difference` forces company currency. [20.0 addons/account/models/account_move_line.py] (source)
2. If a residual remains in the other currency, the exchange difference is made on the fully matched side. A rounding tolerance (`get_amount_range_after_rate`) prevents spurious entries. (source)
3. Company fields: `currency_exchange_journal_id`, `expense_currency_exchange_account_id` (amount > 0), `income_currency_exchange_account_id`. The move has `always_tax_exigible=True`. [20.0 addons/account/models/company.py] (source)
4. `_check_draftable` blocks reset to draft of an exchange entry. (source)
5. Settings: exchange journal and gain/loss accounts; a currency on an account forces moves; a currency on a journal restricts it. [19.0 get_started/multi_currency.rst]
6. Reconciling in another currency auto-creates an exchange difference entry. [19.0 payments.rst]
7. Unrealized gains and losses come from the Unrealized Currencies report. [19.0 bank/foreign_currency.rst]

**Where it breaks.**
- Missing exchange journal or accounts breaks reconciliation of foreign amounts.
- The exchange entry sits in the exchange journal, so a lock date on that journal's period can block it.
- Rounding differences on small amounts may not create an entry (tolerance range).

**By version.**

| Version | Change | Citation |
|---|---|---|
| 16 | `_create_exchange_difference_move` (single). | [16.0 addons/account/models/account_move_line.py] (source) |
| 17 | `_create_exchange_difference_moves` (plural) in plan-based engine. | [17.0 addons/account/models/account_move_line.py] (source) |
| 18 | no change found | [18.0 addons/account/models/account_move_line.py] (source) |
| 19 | Exchange and CABA moves of draft-reconciled entries are made in draft and posted when the original is posted. | [19.0 bank/reconciliation.rst (note)]; [19.0 addons/account/models/account_move.py `_post`] (source) | [corrected]
| 20 | no change found | [20.0 addons/account/models/account_move.py `_post`] (source) | [corrected]

**How to check.** Accounting > Configuration > Settings > Currencies (journal, accounts); Journal Items filtered by the exchange journal.

**Question seeds.**
1. Scenario: A USD invoice is paid at a new rate; the bank shows 1,020 EUR vs invoice 1,000 EUR. Answer: An exchange entry books 20 to the income exchange account. Wrong answer: The payment is partial. The USD amount is settled, only EUR differs.
2. Scenario: Reconciliation fails for a USD payment with "no exchange journal". Answer: Set the exchange journal and accounts in Settings. Wrong answer: Change the payment currency. Fails because the company config is missing.
3. Scenario: A user resets an exchange entry to draft to fix it. Answer: Blocked by `_check_draftable`; unreconcile instead. Wrong answer: Edit the amount. It cannot be drafted.
4. Scenario: Year-end revaluation of open foreign receivables. Answer: Unrealized Currencies report entry, reversed next period. Wrong answer: The exchange difference journal does this on its own. It only books on reconcile.

---

## 6. Bank statement lines and bank reconciliation

**What it is.** `account.bank.statement.line` is a bank transaction that is also a move (`_inherits = {'account.move': 'move_id'}`, 16 to 20). Reconciliation matches it against open items or accounts.

**How it works.**
1. Fields: `payment_ref`, `amount`, `foreign_currency_id`, `amount_currency`, `is_reconciled`, `amount_residual`, `running_balance`, `transaction_details` (Json, 17+). [19.0 addons/account/models/account_bank_statement_line.py] (source)
2. The move has a liquidity line (journal `default_account_id`) and a suspense line (`suspense_account_id`) until reconciled. `is_reconciled` is true when suspense lines' residual is zero. [19.0 get_started/journals.rst]; [19.0 bank/reconciliation.rst]
3. Reconciling replaces the suspense line with the counterpart account. [16.0 bank/reconciliation.rst]
4. 16/17/18 docs: three-section view, "Reconcile items" and "Match existing entries". [16.0 bank/reconciliation.rst]
5. 19/20 docs: "Bank Matching" view with buttons Set Partner, Set Account, Receivable, Payable, Reconcile, Batches, models, Open Journal Entry, Delete Transaction. [19.0 bank/reconciliation.rst]
6. Default rules (19 docs): no partner, label vs Number, Customer Reference, Bill Reference, Payment Reference; with partner, exact, discounted, amount in label. [19.0 bank/reconciliation.rst]
7. A lower amount leaves the invoice open or marks it fully paid; a higher amount leaves the transaction partly reconciled. [19.0 bank/reconciliation.rst]
8. Netting: Accounting > Accounting > Reconcile. [19.0 bank/reconciliation.rst]
9. `account.bank.statement`: `balance_end`, `balance_end_real`, `is_complete`, `is_valid` (16 to 20). [20.0 addons/account/models/account_bank_statement.py] (source) [corrected]

**Where it breaks.**
- Unreconciled lines sit on the suspense account and inflate it. Locking a period with them raises an error. [20.0 addons/account/models/company.py `_validate_locks`] (source) [corrected]
- Enterprise widget code was not read; matching UI details beyond docs are unknown.

**By version.**

| Version | Change | Citation |
|---|---|---|
| 16 | Three-section reconcile view. | [16.0 bank/reconciliation.rst] |
| 17 | `transaction_details` Json field. Docs view unchanged. | [17.0 addons/account/models/account_bank_statement_line.py] (source) |
| 18 | no change found | [18.0 bank/reconciliation.rst] |
| 19 | "Bank Matching" view; trigram index on `payment_ref`. | [19.0 bank/reconciliation.rst]; [19.0 addons/account/models/account_bank_statement_line.py] (source) |
| 20 | no change found (`is_valid` on the statement exists in 16 to 20). | [20.0 addons/account/models/account_bank_statement.py] (source) | [corrected]

**How to check.** Accounting > Reporting > Journal Items on the suspense account; or Bank journal dashboard "Reconcile".

**Question seeds.**
1. Scenario: The suspense account balance is non-zero at month-end. Answer: Unreconciled statement lines; reconcile them. Wrong answer: Post a manual entry to clear it. It hides the open lines.
2. Scenario: A bank line is 980 against a 1,000 invoice. Answer: Leave the invoice open for 20 or write it off via a model/manual action. Wrong answer: Odoo auto-writes off. It does not without a model.
3. Scenario: A bank line is 1,050 vs a 1,000 invoice. Answer: The line is partly reconciled; 50 remains. Wrong answer: The invoice becomes overpaid. Invoice residual cannot go negative.
4. Scenario: Developer queries statement line state through `move_id.state`. Answer: Use `is_reconciled` on the line; move state is posted. Wrong answer: state "reconciled". No such move state.

---

## 7. Reconcile models

**What it is.** `account.reconcile.model` automates counterpart lines and invoice matching for bank lines.

**How it works.**
1. 16/17/18: `rule_type` writeoff_button / writeoff_suggestion / invoice_matching, with `auto_reconcile`, `matching_order`, `match_nature`, `match_amount`, `match_label`, `allow_payment_tolerance`, `payment_tolerance_type`, `past_months_limit`, `match_text_location_*`. [18.0 addons/account/models/account_reconcile_model.py] (source)
2. Docs 16/17/18: put "Invoices/Bills perfect match" first in the sequence. [18.0 bank/reconciliation_models.rst]
3. 19 (community): `trigger` (manual/auto_reconcile), `can_be_proposed`, `mapped_partner_id`, `match_journal_ids`, `match_amount` (lower/greater/between), `match_label` (contains/not_contains/match_regex), `match_partner_ids`, `line_ids`. `rule_type`, payment tolerance, and `matching_order` not found in this file. [19.0 addons/account/models/account_reconcile_model.py] (source)
4. 20: `payment_tolerance`, `payment_tolerance_type`, `matching_order` (new_first/old_first, default old_first) and `rule_type` (matching_rule/reco_model) return. `trigger` is computed from `rule_type`. A matching_rule must be automatic; percent tolerance 0..100; amount tolerance positive. [20.0 addons/account/models/account_reconcile_model.py] (source)
5. `mapped_partner_id` is set when `match_label` is set and exactly one line has a partner and no account. (source)
6. Docs 19/20 are identical: manual/automated, conditions, counterpart items, partner mapping. [19.0 bank/reconciliation_models.rst]; [20.0 bank/reconciliation_models.rst]

**Where it breaks.**
- Model order matters: a broad model before "perfect match" steals lines.
- Docs 20 never mention `rule_type`; source differs from docs.
- Auto-reconcile on a loose label regex books wrong partners silently.

**By version.**

| Version | Change | Citation |
|---|---|---|
| 16 | Three rule types. | [16.0 bank/reconciliation_models.rst] |
| 17 | no change found | [17.0 bank/reconciliation_models.rst] |
| 18 | no change found | [18.0 bank/reconciliation_models.rst] |
| 19 | Fields reshaped: `trigger`, `can_be_proposed`, `mapped_partner_id`; `rule_type` not found. | [19.0 addons/account/models/account_reconcile_model.py] (source) |
| 20 | `rule_type` matching_rule/reco_model, tolerance and `matching_order` back. | [20.0 addons/account/models/account_reconcile_model.py] (source) |

**How to check.** Accounting > Configuration > Reconciliation Models; shell: `env['account.reconcile.model'].search([]).read(['name','trigger'])`.

**Question seeds.**
1. Scenario: Bank fees keep landing as unmatched. Answer: Create a manual/propose model with label match and a counterpart expense line. Wrong answer: Auto-reconcile all small lines. It mis-books.
2. Scenario: Two models match one line; the wrong one wins. Answer: Reorder by sequence. Wrong answer: Delete the broad one. Reordering is the fix.
3. Scenario: Customer pays 1 cent less repeatedly. Answer: Payment tolerance (percent or amount) in the model (18, 20). Wrong answer: Same in 19 Community. The field was not found in the 19 file.
4. Scenario: A model should find the partner from the label. Answer: Set `match_label` with one partner-only line, giving `mapped_partner_id`. Wrong answer: Add the partner to `match_partner_ids`. That filters, it does not assign.

---

## 8. Journals

**What it is.** A journal groups entries by type and holds their numbering and default accounts. Types: bank, cash, credit card, sales, purchase, misc. [19.0 get_started/journals.rst]

**How it works.**
1. Short code is 1 to 5 characters and prefixes names. [19.0 get_started/journals.rst]
2. Bank, cash, credit journals use a suspense account. [19.0 get_started/journals.rst]
3. Outstanding receipts/payments accounts sit on payment method lines. A main bank account as outstanding sends the invoice straight to Paid. [19.0 get_started/journals.rst]
4. The hash option cannot be removed once a posted entry exists. [19.0 get_started/journals.rst]
5. Cash journals have profit and loss accounts. [19.0 get_started/journals.rst]
6. `refund_sequence` defaults true for sale/purchase; `payment_sequence` defaults true for bank, cash, credit (16/17: bank, cash only). [18.0 addons/account/models/account_journal.py] (source) [corrected]

**Where it breaks.**
- Journal currency restricts entries to that currency.
- Wrong type blocks selection on invoices (sale journal for out_invoice).

**By version.**

| Version | Change | Citation |
|---|---|---|
| 16 | `refund_sequence` / `payment_sequence` options. | [16.0 customer_invoices/sequence.rst] |
| 17 | no change found (`_compute_refund_sequence` already exists in 16). | [17.0 addons/account/models/account_journal.py] (source) | [corrected]
| 18 | 'credit' type in annual sequence group. | [18.0 addons/account/models/account_move.py `_get_starting_sequence`] (source) |
| 19 | no change found | [19.0 get_started/journals.rst] |
| 20 | no change found | [20.0 get_started/journals.rst] |

**How to check.** Accounting > Configuration > Journals.

**Question seeds.**
1. Scenario: Client wants invoices Paid immediately on payment. Answer: Use the bank account as outstanding account. Wrong answer: Mark invoices paid manually. It skips the entry.
2. Scenario: Client wants to turn off hashing after a year. Answer: Not possible once entries are posted. Wrong answer: Untick the box. It is blocked.
3. Scenario: Two journals share the code "INV". Answer: Codes must be unique; choose another [19.0 get_started/journals.rst]. The scope of the rule (per company) is not verified. Wrong answer: Allowed with different types. Names would collide. (Uniqueness rule not verified in source; see Doubts.) [corrected]
4. Scenario: Cash differences at count. Answer: Cash journal profit/loss accounts. Wrong answer: Suspense. Cash has dedicated accounts.

---

## 9. Sequences and move names

**What it is.** `account.move.name` is computed from the journal sequence by `_compute_name` using the sequence mixin.

**How it works.**
1. 16/17: sale/bank/cash journals use `CODE/YYYY/00000`; others `CODE/YYYY/MM/0000`. "R" prefix with `refund_sequence`; "P" with `payment_sequence`. [17.0 addons/account/models/account_move.py `_get_starting_sequence`] (source)
2. Regexes: monthly, yearly, year_range, year_range_monthly. `sequence_prefix` and `sequence_number` are stored. [17.0 addons/account/models/sequence_mixin.py] (source)
3. `_constrains_date_sequence` raises when date and name disagree (a config parameter bypasses). (source)
4. A never-posted move whose name mismatches the date has its name reset (`posted_before`). (source)
5. Docs: resequence wizard in dev mode, blocked before a lock date, for duplicates or invalid ranges. [19.0 customer_invoices/sequence.rst]
6. "Dedicated Credit Note Sequence" adds R; "Dedicated Payment Sequence" adds P, else PAY. [19.0 get_started/journals.rst]

**Where it breaks.**
- Changing the date of a posted move to another period needs a resequence.
- Docs mention a "Dedicated Debit Note Sequence" (D); no field found in community source.

**By version.**

| Version | Change | Citation |
|---|---|---|
| 16 | `CODE/YYYY/...` with R/P prefixes. | [16.0 addons/account/models/account_move.py `_get_starting_sequence`] (source) |
| 17 | no change found | [17.0 addons/account/models/account_move.py] (source) |
| 18 | Staggered fiscal year `yy-yy` year part; `is_refund()`. | [18.0 addons/account/models/account_move.py] (source) |
| 19 | Journal `is_self_billing`: names are `CODE{partner id zfill 5}/year/MM/0000`, one sequence per partner. | [19.0 addons/account/models/account_move.py] (source); [19.0 addons/account/models/account_journal.py] (source) | [corrected]
| 20 | no change found | [20.0 addons/account/models/account_move.py] (source) | [corrected]

**How to check.** Journal Entries list, search "Journal" and sort by number; or Accounting > resequence action in dev mode.

**Question seeds.**
1. Scenario: Gaps in invoice numbers after cancelled drafts. Answer: Gaps are from posted-then-cancelled entries; resequence only before lock. Wrong answer: Odoo reuses names. It does not.
2. Scenario: Changing an invoice date to next year raises a sequence error. Answer: `_constrains_date_sequence`; reset to draft and rename or resequence. Wrong answer: Disable the sequence. Bypass is a config parameter, not advised.
3. Scenario: Credit notes should be numbered apart from invoices. Answer: Enable the dedicated credit note sequence (R prefix). Wrong answer: Use a separate journal. Not needed.
4. Scenario: Fiscal year runs Apr-Mar. Answer: 18+ names use `yy-yy` year part. Wrong answer: Same as 17. 17 uses calendar year.

---

## 10. Payment terms

**What it is.** A payment term splits an invoice into due dates and optional early discount.

**How it works.**
1. 16: discount fields per line (`discount_percentage`, `discount_days`; line `value` balance/percent/fixed, `days`, `end_month`). [16.0 addons/account/models/account_payment_term.py] (source)
2. 17+: discount on the term (`early_discount`, `discount_percentage` default 2.0, `discount_days` default 10, `early_pay_discount_computation` included/excluded/mixed). Line `value` is percent/fixed. Lines have `delay_type` (days_after, days_after_end_of_month, days_after_end_of_next_month, days_end_of_month_on_the), `nb_days`, `days_next_month`. [17.0 addons/account/models/account_payment_term.py] (source)
3. 20 constraints: percent lines sum to 100; early discount only with a single 100% line; discount percentage and days positive. [20.0 addons/account/models/account_payment_term.py] (source)
4. `_get_due_date` for days_end_of_month_on_the: `due_date + nb_days + relativedelta(months=1, day=days_next_month)`, or end of month if `days_next_month <= 0`. (source)
5. One payment_term line is created per due date. [19.0 customer_invoices/payment_terms.rst]

**Where it breaks.**
- A 16 term with line discounts cannot be moved as is to 17+ structure.
- Early discount with several lines is rejected.
- Docs describe "end of month, then add days"; source is described above. The docs example matches.

**By version.**

| Version | Change | Citation |
|---|---|---|
| 16 | Discount per line. | [16.0 addons/account/models/account_payment_term.py] (source) |
| 17 | Discount per term; new `delay_type`. | [17.0 addons/account/models/account_payment_term.py] (source) |
| 18 | no change found | [18.0 addons/account/models/account_payment_term.py] (source) |
| 19 | no change found | [19.0 customer_invoices/payment_terms.rst] |
| 20 | Constraints as above. | [20.0 addons/account/models/account_payment_term.py] (source) |

Note: 18 and 19 compared by docs and spot checks only.

**How to check.** Accounting > Configuration > Payment Terms; create an invoice and read the payment_term lines.

**Question seeds.**
1. Scenario: Terms "30% now, 70% at 60 days" with 2% discount. Answer: Not allowed; discount needs a single 100% line. Wrong answer: Discount applies to the 70%. Constraint rejects.
2. Scenario: "15th of next month after invoice". Answer: `days_end_of_month_on_the` with `days_next_month` 15. Wrong answer: 45 days. Not equal.
3. Scenario: Upgrade 16 to 17 with line-level discounts. Answer: Structure moved to the term; check migrated terms. Wrong answer: Nothing changes. Fields moved.
4. Scenario: Invoice with 3 installments. Answer: 3 payment_term lines on the move. Wrong answer: One line, 3 reconcile partials. One line per due date.

---

## 11. Credit notes and reversals

**What it is.** A credit note (out_refund/in_refund) reverses an invoice. `_reverse_moves` creates it.

**How it works.**
1. `_reverse_moves(default_values_list, cancel)` sets move_type via `TYPE_REVERSE_MAP` and `reversed_entry_id`. For entries it negates balance and amount_currency (flips `is_storno` with `account_storno`). With `cancel=True` it posts with `soft=False` and `_post` reconciles the reverse with the original. [20.0 addons/account/models/account_move.py `_reverse_moves`] (source)
2. Wizard 16: `refund_method` cancel/refund/modify. [16.0 addons/account/wizard/account_move_reversal.py] (source)
3. Wizard 17+: `refund_moves()` and `modify_moves()` (`reverse_moves(is_modify)`). Cancel is needed when not auto-post and (modify or entry). [20.0 addons/account/wizard/account_move_reversal.py `reverse_moves`] (source)
4. Docs: "Reverse" gives a draft credit note; "Reverse and Create invoice" gives a validated credit note reconciled with the original plus a new draft. Sequence RINV/... [19.0 customer_invoices/credit_notes.rst]
5. `_unlink_or_reverse`: reverse if the move cannot be unlinked (posted before and hash, date <= fiscal lock, posted CABA under tax lock, or exchange entry); cancel if audit-trail protected; else unlink. [20.0 addons/account/models/account_move.py] (source)
6. `_post` refuses a negative-total invoice ("create a credit note instead"), requires a partner, and for bills a date. [20.0 addons/account/models/account_move.py `_post`] (source)

**Where it breaks.**
- Full credit note with no payment gives `reversed`, not `paid`.
- Reversal date in a locked period moves after the lock.
- Negative invoice totals are rejected.

**By version.**

| Version | Change | Citation |
|---|---|---|
| 16 | Wizard `refund_method` cancel/refund/modify. | [16.0 addons/account/wizard/account_move_reversal.py] (source) |
| 17 | `refund_method` removed; `refund_moves`/`modify_moves`. | [17.0 addons/account/wizard/account_move_reversal.py] (source) |
| 18 | no change found | [18.0 addons/account/wizard/account_move_reversal.py] (source) |
| 19 | no change found | [19.0 addons/account/wizard/account_move_reversal.py] (source) |
| 20 | Wizard `move_type` shows 'entry' when all selected are entries. | [20.0 addons/account/wizard/account_move_reversal.py] (source) |

**How to check.** Invoice > Credit Note button; the original shows the "reversed" log message in chatter.

**Question seeds.**
1. Scenario: Customer invoice posted in a locked month needs cancelling. Answer: Reverse with a date after the lock. Wrong answer: Reset to draft. Blocked by lock and hash.
2. Scenario: Wrong invoice; client wants it fixed in one click. Answer: "Reverse and Create invoice". Wrong answer: "Reverse" alone. Leaves a draft credit note only.
3. Scenario: Manager types a negative-amount invoice. Answer: `_post` refuses. Wrong answer: Allowed as a credit. It raises.
4. Scenario: Credit note fully offsets the invoice; AR report shows "reversed". Answer: Correct; no payment was involved. Wrong answer: A bug since residual is zero. Per rules it is `reversed`.

---

## 12. Draft vs posted, hash and inalterability

**What it is.** A move is draft, posted, or cancel. Posting assigns the number and makes it count in reports.

**How it works.**
1. `_post(soft=True)` makes future-dated moves `auto_post='at_date'`. [20.0 addons/account/models/account_move.py `_post`] (source)
2. `button_draft` needs posted or cancel, runs `_check_draftable` (no exchange moves, no `inalterable_hash`), removes analytic and COGS lines. (source)
3. `posted_before` marks a move posted once. (source)
4. Hash: `inalterable_hash`, `secure_sequence_number`, journal `restrict_mode_hash_table`. SHA-256 chain over name, date, journal_id, company_id, debit, credit, account_id, partner_id. [19.0 reporting/data_inalterability.rst]
5. 19/20 add company `restrictive_audit_trail`. 18 has `checked` replacing `to_check`. [19.0 addons/account/models/company.py] (source)

**Where it breaks.**
- Hashed moves cannot return to draft; reverse instead.
- Moves from before the hash was enabled are not hashed.

**By version.**

| Version | Change | Citation |
|---|---|---|
| 16 | Draft/posted/cancel; hash by journal. | [16.0 reporting/data_inalterability.rst] |
| 17 | no change found | [17.0 reporting/data_inalterability.rst] |
| 18 | `checked` replaces `to_check`. | [18.0 addons/account/models/account_move.py] (source) |
| 19 | `restrictive_audit_trail`. | [19.0 addons/account/models/company.py] (source) |
| 20 | no change found. Posting draft exchange/CABA moves is in 19 too. | [19.0 addons/account/models/account_move.py `_post`] (source) | [corrected]

**How to check.** Journal Entries list, filter Status; Journal settings "Lock Posted Entries with Hash".

**Question seeds.**
1. Scenario: A hashed invoice has a typo. Answer: Reverse and recreate. Wrong answer: Reset to draft. Blocked.
2. Scenario: Invoice dated next month is validated. Answer: It waits as auto post at date (soft post). Wrong answer: It posts now. `soft=True` defers.
3. Scenario: Audit asks to prove no tampering. Answer: Hash integrity report. Wrong answer: Chatter logs. Not verifiable.
4. Scenario: Entry with exchange difference; user wants to reset to draft. Answer: Unreconcile first. Wrong answer: Just draft it. Blocked.

---

## 13. Lock dates

**What it is.** Lock dates stop edits to entries on or before a date.

**How it works.**
1. 16/17: `period_lock_date` (advisers can edit), `fiscalyear_lock_date` (all users), `tax_lock_date`; 17 adds `max_tax_lock_date`. `_get_user_fiscal_lock_date` is max of period and fiscalyear, only fiscalyear for account managers. [17.0 addons/account/models/company.py] (source)
2. 18+: `fiscalyear_lock_date` ("Global Lock Date"), `tax_lock_date` (set when the tax closing entry posts), `sale_lock_date`, `purchase_lock_date`, `hard_lock_date`. `period_lock_date` is gone. [20.0 addons/account/models/company.py] (source)
3. Exceptions: `account.lock_exception` (state active/revoked/expired; `user_id` empty means everyone; `end_datetime` empty means forever; `lock_date_field`). [20.0 addons/account/models/account_lock_exception.py] (source)
4. `_get_user_fiscal_lock_date(journal)`: max of fiscalyear and hard, plus sale lock on sale journals or purchase lock on purchase journals. (source)
5. `_post` moves a locked date to the day after the lock. `copy` does the same. `_check_fiscal_lock_dates` raises "You cannot add/modify entries prior to and inclusive of: ...". `_check_tax_lock_date` applies to lines affecting the tax report. (source)
6. `_validate_fiscalyear_lock` (16, 17), renamed `_validate_locks` (18 to 20), raises on unreconciled statement lines in the period. In 20 it also rejects a hard lock while draft entries exist. [20.0 addons/account/models/company.py `_validate_locks`] (source) [corrected]
7. Docs: year_end.rst (Lock Everything, exception for me/everyone, hard lock irreversible); tax_returns.rst. [19.0 reporting/year_end.rst]; [19.0 reporting/tax_returns.rst]

**Where it breaks.**
- Hard lock cannot be undone.
- Docs 16/17 `year_end.rst` mention the `account_lock` module for the irreversible lock.
- Locking with unreconciled bank lines fails.

**By version.**

| Version | Change | Citation |
|---|---|---|
| 16 | period, fiscalyear, tax locks. | [16.0 addons/account/models/company.py] (source) |
| 17 | `max_tax_lock_date`. Irreversible lock via `account_lock` module in docs (16 docs say the same). | [17.0 addons/account/models/company.py] (source); [17.0 reporting/year_end.rst] | [corrected]
| 18 | Sale, purchase, hard locks; exceptions model; period lock removed. | [18.0 addons/account/models/company.py] (source); [18.0 addons/account/models/account_lock_exception.py] (source) |
| 19 | no change found | [19.0 reporting/year_end.rst] |
| 20 | `_validate_locks` checks seen; no further change found | [20.0 addons/account/models/company.py] (source) |

**How to check.** Accounting > Configuration > Settings > Lock Dates, or Accounting > Accounting > Lock Dates (19 docs: [19.0 reporting/year_end.rst]; 16 to 18 not verified). [corrected]

**Question seeds.**
1. Scenario: A bookkeeper must post one late bill in a closed month in 19. Answer: Create a lock exception for that user and time. Wrong answer: Lower the global lock date. Opens the period for all.
2. Scenario: Client wants sales closed but purchases open. Answer: Use `sale_lock_date` only (18+). Wrong answer: Fiscal lock. Locks all journals.
3. Scenario: Auditor asks for a lock nobody can lift. Answer: Hard lock date. Wrong answer: Global lock. Reversible.
4. Scenario: Post an invoice dated in a locked period. Answer: Date moves to the day after the lock. Wrong answer: It errors. `_post` shifts the date.

---

## 14. What changed 16 to 20 in reconciliation, payment states and payment modelling

**What it is.** A summary of the cross-topic changes above.

**How it works.**

| Version | Reconciliation | Payment states and model | Citation |
|---|---|---|---|
| 16 | `reconcile()`, `_prepare_reconciliation_partials` | Payment inherits move; state is move state | [16.0 addons/account/models/account_move_line.py]; [16.0 addons/account/models/account_payment.py] (source) |
| 17 | Plan-based engine, hooks | no change found (`blocked` and `_compute_status_in_payment` first appear in 18) | [17.0 addons/account/models/account_move_line.py]; [17.0 addons/account/models/account_move.py] (source) | [corrected]
| 18 | no further change found | Own payment state, optional move, in_process; `blocked` payment_state, `_compute_status_in_payment` | [18.0 addons/account/models/account_payment.py] (source) | [corrected]
| 19 | Draft entries can reconcile (`draft_caba_move_vals`) and their exchange/CABA moves post with the original; Bank Matching view in docs | Drafts get payment_state; `force_payment_move` | [19.0 addons/account/models/account_partial_reconcile.py]; [19.0 addons/account/models/account_move.py] (source) | [corrected]
| 20 | Reconcile models re-add `rule_type` | paid/reconciled payment states | [20.0 addons/account/models/account_payment.py]; [20.0 addons/account/models/account_reconcile_model.py] (source) | [corrected]

**Where it breaks.** Docs 19 and 20 lag source for payment states and reconcile model types.

**How to check.** Diff `addons/account/models/account_payment.py` between branches 17.0 and 18.0, then 19.0 and 20.0.

**Question seeds.**
1. Scenario: A custom module reads `payment.move_id.line_ids` for every payment in 18. Answer: Payments without an outstanding account have no move. Wrong answer: Always set. Optional since 18.
2. Scenario: Migration code filters `payment.state == 'in_process'` in 20. Answer: Renamed; use paid/reconciled. Wrong answer: Still valid. Names shifted.
3. Scenario: A 17 module overrides `reconcile()` internals. Answer: Rework for `_reconcile_plan`. Wrong answer: Works unchanged. Engine rewritten.
4. Scenario: Team plans to rely on docs for 20 payment states. Answer: Read source; docs identical to 19. Wrong answer: Docs are current. They still say "In payment".

---

## Gaps

- The Enterprise `account_accountant` override of `_get_invoice_in_payment_state` is not public. Not found.
- Where payment tolerance and `matching_order` live in 19 (not in the community file). Not found.
- The docs changelog for accounting was not consulted.
- Cash basis (taxes/cash_basis.rst) and cash discount docs were not read in detail.
- The Enterprise bank reconciliation widget code was not read.
- The "Dedicated Debit Note Sequence" (D) has no field in community source. Not found.
- `_get_valid_payment_states` hook name in 19/20 was seen in the source scan but not re-verified; not cited above.
- Statement file import formats and `account.bank.statement` internals were not read in detail.
- Journal code uniqueness rule was not verified.
- Location of the lock dates screen path in each version was not verified.

## Doubts

- Docs 19 and 20 still say "In payment" while 20 source renamed payment states. Which is current for released 20 is unclear.
- Docs 20 `payments.rst` and `reconciliation_models.rst` are identical to 19; they may be stale.
- Docs 16/17 describe the three-section reconcile view; Enterprise holds that code, so behavior is from docs only.
- Docs 17 `year_end.rst` still mention the `account_lock` module.
- The `amount_residual` By-version rows for 17, 18, 19 rest on diffs of the payment-state code, not a full diff of `_compute_amount`.
- The 18/19 payment `_compute_state` description came from a reading of the source; the exact branch for "all invoices paid" should be rechecked before use in a test.
- In payment terms the 18 and 19 rows are "no change found" from spot checks only.
