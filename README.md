# Reconcile

Study app for senior-level Odoo 16 to 20. It has five tracks: ledger (invoice,
payment, reconciliation), ORM and views, version deltas, field notes (scenarios
from the docs map), and operations.

Card types: predict (a small ledger simulation checks the answer), spot the bug,
decide, triage. A level opens after the one above it passes at 80%. Concepts
return on a Leitner schedule (1, 2, 4, 8, 16 days).

Cards that state a fact about Odoo name the version and the
[odoo/documentation](https://github.com/odoo/documentation) page or `odoo/odoo`
source file that backs it. Practice cards carry no source.

## Develop

```bash
bun install
bun run dev    # http://localhost:3000
bun run test   # ledger, scheduler, session, progress, scoring, ranking and the session screen
bun run build && bun run start
```

Study progress lives in localStorage and works without a server. The leaderboard
needs the Node server (`next start`), Node 22.18 or newer, and a persistent disk
for the SQLite file. Copy `.env.example` to `.env.local` to configure it; every
variable is explained there. In production `SESSION_SECRET` is required.

The tests call the real route handlers over a temporary SQLite file. The
concurrency tests start two Node processes that run TypeScript directly, which
is why Node 22.18 is the floor; the session screen tests run in happy-dom.

## Leaderboard

A player picks a nickname and gets a signed cookie. There is no email and no
password, so a new browser is a new player. Players can rename or leave (which
deletes their points) on `/leaderboard/`.

- **Scoring.** 10 points per correct card. A card pays once per player per UTC
  day, so repeating a level cannot grow the total. The week runs Monday 00:00
  UTC to Monday.
- **Trust.** The browser sends the seed it plays with when a run opens, and the
  option indexes it picked when the run ends. The server keeps the seed with the
  run, re-derives each card from it, judges the picks itself and refuses runs
  that finish faster than 2 seconds per card, replays, and runs that do not
  match the cards the server opened.
- **Ranking.** Points, highest first. Equal points go to whoever reached them
  first.
- **Moderation.** Nicknames are ASCII only, unique regardless of case and
  separators, and screened for slurs. Players who have earned points can report
  an entry; three reporters hide it until a moderator decides. With
  `ADMIN_TOKEN` set:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://host/api/admin/players/
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"id":"<player id>","verdict":"hide"}' https://host/api/admin/players/   # or unhide, delete
```

The answer keys ship in the client bundle, because cards are judged in the
browser too. The server stops invented scores, replays and speed runs; it cannot
stop someone who reads the bundle and answers correctly at a human pace. The
once-a-day cap bounds what that is worth, and `delete` removes the entry.

## Layout

| Path                          | Owns                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/sim/ledger.ts`           | Receivable-line model: payments, credit notes, partial reconciles, `payment_state`                                                        |
| `src/learning/`               | Leitner boxes, the 80% gate, card preparation (seeded shuffle, generated figures), progress store                                         |
| `src/content/`                | Cards by track. Fact cards carry a `source`                                                                                               |
| `docs/map/`                   | A cited map of Odoo 16 to 20 in four areas: accounting, backend, frontend, platform. The source for the field notes and for later cards   |
| `docs/architecture.md`        | Every server state (player, attempt, credit, report), who moves each transition and when, and what keeps the rules true under concurrency |
| `src/learning/judge.ts`       | Judges a card's picks from its seed. The server's only source of truth for a verdict                                                      |
| `src/server/`                 | SQLite storage, scoring, ranking, moderation, the player cookie, rate limits                                                              |
| `src/app/api/`                | Route handlers over `src/server/`                                                                                                         |
| `src/test/`                   | Test support: a browser-like client for the route handlers, card helpers, a DOM, and the second process for the concurrency tests         |
| `src/app/`, `src/components/` | Pages and the session player                                                                                                              |
