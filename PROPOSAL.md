# Odoo 16–20, senior track: learning proposal

## What odoo.xlsx tells us

The file is your own Odoo 17 senior-consultant exam, in Spanish. It has nine
sheets. One case runs through all of them: a customer invoice, a partial payment,
and the pending balance (`amount_residual`).

The answers are not definitions. They are judgments with a reason attached:

- Use what the core already gives you (`amount_residual`, `decoration-*`) before writing code.
- Check before you anchor an xpath: count the matches for that `@name`.
- A valid arch is not a visible field. Open the view, or run a tour.
- Reconciling changes `amount_residual` but not always the invoice's `write_date`. An incremental extract misses it.
- A Postgres replica has no `ir.rule`. A role gives table access, not row filtering.
- Migration scripts must be idempotent. Rehearse the full run on a fresh snapshot.
- Python decides business logic. JS only decides how to show it.

The study material should train that judgment. It should not train vocabulary.

## What to take from learnkafka, and what to leave

Take the learning loop. It is the valuable part.

| Take | How it applies here |
| --- | --- |
| Predict, then watch | You predict `payment_state` and `amount_residual` before the ledger runs. |
| Incident, then fix | A broken view, a broken migration or a stuck invoice. You find the cause. |
| Recall check, 80% gate | A level unlocks only after you answer from memory. Below 80% you get a variant with new numbers. |
| Leitner boxes (1, 2, 4, 8, 16 days) | A daily review of your weakest concepts, with confusable pairs interleaved. |
| "Where the metaphor breaks" note | One note per level on where the simplified model lies. |
| Pure simulation core, tested | A small TypeScript ledger. Vitest checks it against the xlsx numbers. |

Leave behind: Three.js, music, SFX, the world map and the i18n routing. They cost
more than they teach. A card-and-ledger UI is enough.

## Decisions I made (correct any of them)

1. **Spanish UI, English technical terms.** Your exam is in Spanish. No i18n layer.
2. **Version deltas are the spine.** One concept is learned as "what changed between 16, 17, 18, 19 and 20", not as a separate pass per version.
3. **Source-cited cards.** Every card names a version and a source. A claim I could not verify is tagged `[unverified]` and shown that way.
4. **Static app, no backend.** Progress lives in localStorage. Deploy to Vercel from the CLI that is already installed.
5. **The project is a normal repo, not a Captain task.** It would be created under `~/git/`, with its own commit rules.

## Curriculum

Four tracks. Each has about five levels of 3–5 minutes.

### A. Ledger (the simulation)
Invoice, payment, `account.partial.reconcile`, `account.full.reconcile`. The learner predicts the residual and the state for partial payment, overpayment, credit note, and a payment in a second currency. Probe: `amount_residual` is in the invoice currency and `amount_residual_signed` is in the company currency. Is `total_cobrado = amount_total - amount_residual` still right on a credit note?

### B. ORM and views
`@api.depends` vs `@api.constrains` vs `@api.onchange`. `store=True` and what it costs. Xpath anchors: count matches, anchor on `@name`. Groups and `implied_ids`. Spot-the-bug cards use a diff of XML or Python.

### C. Version deltas (16 → 20)
Confirmed in the docs on context7:

| Version | Change |
| --- | --- |
| 16 | OWL 2 |
| 17 | `attrs` and `states` removed from views. `name_get` replaced by `_compute_display_name`. `odoo.tools.SQL` wrapper. |
| 18 | `tree` renamed to `list` in views. `_search_display_name`. `check_access`, `has_access`, `_filtered_access`. |
| 19 | External JSON-2 API: `POST /json/2/<model>/<method>`, bearer API key, `X-Odoo-Database` header. |
| 20 | The `20.0` source branch is visible on context7. There is no documentation for it yet. Cards for 20 are `[unverified]` until I read the source. |

I still need to verify before writing cards: the exact date XML-RPC and JSON-RPC are removed, the 19 changes to the account models, and the 18 changes to `read_group`. I will not write those from memory.

### D. Operations
Upgrade strategy: pre-migrate and post-migrate scripts, integrity queries before and after, the freeze window. Incident triage: first hour, `pg_stat_activity`, `pg_locks`, RPC error tracebacks. Integration: replica vs JSON-2, incremental extraction on `write_date`. Critical thinking: the client who wants to keep Excel.

## Card types

1. **Predict.** Numbers in, numbers out. Checked by the ledger sim.
2. **Spot the bug.** A short diff or XML with one defect. Tap the line.
3. **Decide.** Two or three options with trade-offs. The right answer comes with the reason from your exam, and a wrong answer shows why it fails.
4. **Triage.** An incident with clues revealed one at a time. You choose the next check.
5. **Recall.** The same concept asked again with the context hidden, at the Leitner interval.

## Milestones

- **M1:** scaffold, ledger sim with tests that reproduce 1000 → 400 → 600 → 0, and Track A with its recall check. Deploy to Vercel.
- **M2:** Leitner review, the 80% gate, tracks B and C.
- **M3:** track D, the version-delta matrix, a final mixed exam.

Each milestone ends with: `vitest` passing, one browser run of the real flow, and a deploy URL.

## Risks

- **Accuracy.** Odoo 19 and 20 are newer than most of my sources. The `[unverified]` tag exists for this.
- **Scope.** The sim could grow into a mini accounting engine. It stops at invoice, payment and reconciliation.
- **Exam errors.** Your answers may contain mistakes of their own. I will flag any I find against the docs instead of copying them.

## What I need from you

Say "go" and I start M1. If you want a different cut of tracks, or English instead of Spanish, say so first.
