// One side of a race between two processes on one database file. Run through register.mjs:
//   node --import ./src/test/register.mjs src/test/contend.ts <db file> <scenario> <side> <start ms> <rounds>
// Both sides act at the same wall-clock instants, so their writes collide inside SQLite itself.
// It prints one JSON line: what each round returned, or the error it threw. `CARDS` is a JSON list of card ids.
import { createPlayer, deletePlayer, report, startAttempt, submitAttempt } from "@/server/board";
import { openDb } from "@/server/db";

const [file, scenario, side, startAt, rounds] = process.argv.slice(2);
const db = openDb(file);
const cards: string[] = JSON.parse(process.env.CARDS ?? "[]");
const STEP_MS = 25;

type Result = { ok: boolean; status?: number };
const leaves = (id: string): Result => ({ ok: deletePlayer(db, id) });

const scenarios: Record<string, (round: number, now: number) => Result> = {
  claim: (round, now) => createPlayer(db, `Racer ${round}`, now),
  "last-slot": (round, now) => startAttempt(db, `p-${round}`, cards, 1, now),
  "start-or-delete": (round, now) => (side === "a" ? startAttempt(db, `p-${round}`, cards, 1, now) : leaves(`p-${round}`)),
  "submit-or-delete": (round, now) =>
    side === "a" ? submitAttempt(db, `p-${round}`, `t-${round}`, { picks: cards.map((id) => ({ id, choice: [0] })) }, now) : leaves(`p-${round}`),
  "report-or-delete": (round, now) => (side === "a" ? report(db, "reporter", `p-${round}`, "rude", now) : leaves(`p-${round}`)),
};

const act = scenarios[scenario];
const outcomes: { round: number; status: number | "threw"; detail?: string }[] = [];
for (let round = 0; round < Number(rounds); round++) {
  // Spin rather than sleep: a timer would wake the two sides at different moments.
  while (Date.now() < Number(startAt) + round * STEP_MS);
  try {
    const result = act(round, Date.now());
    outcomes.push({ round, status: result.ok ? 200 : (result.status ?? 0) });
  } catch (error) {
    outcomes.push({ round, status: "threw", detail: String(error) });
  }
}
console.log(JSON.stringify(outcomes));
