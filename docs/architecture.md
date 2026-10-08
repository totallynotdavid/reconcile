# Architecture

Study progress is local to the browser (`src/learning/store.ts`, localStorage).
The leaderboard is the only server state. It lives in one SQLite file written by
one Node process, and everything below describes that state.

## Who acts

| Actor     | Proves it with                             | Reaches state through                      |
| --------- | ------------------------------------------ | ------------------------------------------ |
| Visitor   | nothing                                    | `GET` of the boards, `POST /api/players/`  |
| Player    | cookie `reconcile_player` (`id.HMAC`)      | `/api/players/`, `/api/attempts/`, reports |
| Moderator | `Authorization: Bearer $ADMIN_TOKEN`       | `/api/admin/players/`                      |
| Time      | the server clock, never a client timestamp | attempt expiry, day and week boundaries    |

Every state change by a visitor or player needs a matching `Origin` and a JSON
body. The client never sends a score, a verdict or a time. It sends the seed it
plays with when it opens an attempt, and the server stores it with the attempt.
When the run ends it sends the option indexes it picked and nothing else; the
server re-derives the cards from the stored seed and judges them
(`src/learning/judge.ts`). A seed in a submit is ignored.

## States and transitions

### Player (`players`)

```text
            join                       3rd distinct report, or moderator hide
 (absent) ---------> visible ------------------------------------------------> hidden
                      ^  |                                                        |
                      |  | rename (owner)                                         |
                      |  v                                                        |
                      +--+                                                        |
                      ^---------------- moderator unhide (clears reports) --------+

 visible or hidden --- owner leaves, or moderator delete ---> (absent)
```

| Transition       | Who                           | When                                                                                           |
| ---------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| absent → visible | visitor with no player cookie | The nickname passes `checkNickname` and its folded key is free. See the join budget below.     |
| rename           | the player, visible or hidden | The new key is free or is the player's own. Five per day. A rename never changes `hidden`.     |
| visible → hidden | a player, by a report         | The reporter is visible, has earned a point, is not the target, and is the third distinct one. |
| visible → hidden | moderator                     | Any time.                                                                                      |
| hidden → visible | moderator only                | Any time. Deletes every report against the player so one more does not hide them again.        |
| any → absent     | the player, or a moderator    | Any time. Removes the player's credits, attempts and reports, and reports they made.           |

The join budget is five per hour per client address, plus 100 per hour for the
whole site. The address comes from `X-Forwarded-For` and only when `TRUST_PROXY`
is `1`; without it there is no per-address rule and the site rule alone bounds
identity farming. A join or rename that fails (an invalid or taken nickname)
spends nothing, so a typing mistake does not use up the budget.

Moderator `unhide` on a player who is not hidden also deletes the reports
against them, so it is the way to dismiss reports that did not reach the
threshold.

A hidden player is off both boards and cannot open or score a run or report.
Hiding is not a ban: the owner can still leave and join again under a new
nickname. The deleted player's cookie then names no player and counts as a
visitor.

Deleting a player removes the reports they filed, so a target can fall below the
threshold. `hidden` is a stored flag, not derived from the count, so the target
stays hidden until a moderator decides.

### Attempt (`attempts`)

```text
                       submit (owner, first time, in time)
 (absent) --start--> open ---------------------------------> used
                      |
                      +-- older than ATTEMPT_TTL: expired (refused; removed by the owner's next start)
```

| Transition               | Who                       | When                                                                                             |
| ------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------ |
| absent → open            | a visible player          | The cards exist and are distinct, the seed is a whole number, fewer than 20 attempts are open.   |
| open → used              | the player who started it | Within 2 hours, after at least 2 s per card, and with picks that match the opened cards exactly. |
| open → expired           | time                      | 2 hours after `issued_at`. Nothing is written; the submit is refused with 410.                   |
| used or expired → absent | the owner's next start    | `issued_at` is older than the TTL. Used attempts inside the TTL are kept.                        |

An attempt stores the card ids and the seed it was opened with. `open → used`
reads the row, checks it and marks it used in one write transaction, so a replay
finds `used_at` set and is refused with 409. The "too fast" check runs before
the picks are judged, so a refusal reveals nothing about the answers. Starts are
limited to 120 per hour per player.

### Credit (`credits`)

A credit is one row per (player, card, UTC day) and is never updated. It is
inserted only inside the transaction that moves an attempt to `used`, with
`INSERT OR IGNORE`: the first right answer to a card on a day pays 10 points,
later ones that day pay nothing. A credit leaves only with its player.

Both boards are sums over credits of visible players. The weekly board counts
days from Monday 00:00 UTC. Ranks are computed, never stored.

### Report (`reports`)

A report is one row per (target, reporter). It is inserted by a visible player
who has at least one credit, about a target that exists and is not hidden (a
hidden entry is off the boards, so a report about it is refused with 404). It is
ignored when that reporter already reported the target. It leaves when a
moderator unhides the target, or when either player is deleted.

### Not stored

| State               | Where          | Consequence                                                                         |
| ------------------- | -------------- | ----------------------------------------------------------------------------------- |
| Rate-limit counters | process memory | Reset on restart and not shared between processes.                                  |
| Player cookie       | the browser    | Losing it loses the player. There is no recovery by design (no email, no password). |

## Concurrency

Route handlers call `node:sqlite` synchronously, so one process never
interleaves two requests between a check and its write. A second process or
connection can, so every sequence that reads and then writes (`startAttempt`,
`submitAttempt`, `report`, `moderate`, the migrations) runs inside `exclusively`
(`src/server/db.ts`), which takes the write lock with `BEGIN IMMEDIATE` before
the first read. Another connection waits for the lock (up to three seconds) and
then sees the committed result, so a check made inside the sequence is still
true when its write happens. The player lookup is inside the same transaction,
which is why a player deleted by another connection yields 401 or 404 and never
a foreign-key error.

| Rule                                | Held by                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| One owner per nickname              | `UNIQUE (nickname_key)`; the insert or update is the claim, a violation is a 409    |
| A run is scored once                | `used_at` is read and set inside `exclusively`                                      |
| At most 20 open attempts per player | the count and the insert share one `exclusively`                                    |
| The report threshold                | the insert and the count share one `exclusively`; the third report hides, exactly   |
| A card pays once per player per day | primary key on `credits`                                                            |
| One report per reporter and target  | primary key on `reports`                                                            |
| Nothing refers to a deleted player  | `ON DELETE CASCADE`, and the player is looked up inside the transaction that writes |

Only a nickname claim has no lock: it is a single statement, and the `UNIQUE`
index decides between two claims.

The supported shape is one instance with a persistent disk. Several instances
would need a shared rate limiter.

## Changing this

Adding a state, or letting another actor move a transition, starts here: update
the tables above in the same change, then the schema (append to `MIGRATIONS` in
`src/server/db.ts`; shipped entries never change) and the tests: the rules in
`src/server/board.test.ts`, the routes in `src/server/routes.test.ts`, and any
new check-then-write sequence as a scenario in `src/test/contend.ts` raced from
`src/server/concurrency.test.ts`.
