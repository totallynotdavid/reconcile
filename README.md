# Reconcile

Study app for senior-level Odoo 16 to 20. It has five tracks: ledger (invoice, payment, reconciliation), ORM and views, version deltas, field notes (scenarios from the docs map), and operations.

Card types: predict (a small ledger simulation checks the answer), spot the bug, decide, triage. A level opens after the one above it passes at 80%. Concepts return on a Leitner schedule (1, 2, 4, 8, 16 days).

Cards that state a fact about Odoo name the version and the [odoo/documentation](https://github.com/odoo/documentation) page or `odoo/odoo` source file that backs it. Practice cards carry no source.

## Develop

```bash
bun install
bun run dev    # http://localhost:3000
bun run test   # ledger, scheduler, session and progress behavior
bun run build   # static export to out/
```

Progress lives in localStorage. There is no backend.

## Layout

| Path | Owns |
| --- | --- |
| `src/sim/ledger.ts` | Receivable-line model: payments, credit notes, partial reconciles, `payment_state` |
| `src/learning/` | Leitner boxes, the 80% gate, card preparation (seeded shuffle, generated figures), progress store |
| `src/content/` | Cards by track. Fact cards carry a `source` |
| `docs/map/` | A cited map of Odoo 16 to 20 in four areas: accounting, backend, frontend, platform. The source for the field notes and for later cards |
| `src/app/`, `src/components/` | Pages and the session player |
