import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ALL_CARDS } from "@/content";
import { MAX_OPEN_ATTEMPTS } from "./board";
import { type Db, exclusively, openDb } from "./db";

// These tests run two real Node processes against one database file. A single thread cannot interleave
// two requests, so only separate processes show what the database does when two writers collide.

const here = path.dirname(fileURLToPath(import.meta.url));
const REGISTER = path.resolve(here, "../test/register.mjs");
const CONTEND = path.resolve(here, "../test/contend.ts");
const ROUNDS = 40;

type Outcome = { round: number; status: number | "threw"; detail?: string };

function runSide(file: string, scenario: string, side: "a" | "b", startAt: number, cards: string[]): Promise<Outcome[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", REGISTER, CONTEND, file, scenario, side, String(startAt), String(ROUNDS)], {
      env: { ...process.env, CARDS: JSON.stringify(cards) },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("close", (code) => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`side ${side} exited ${code}: ${err}`))));
  });
}

/** Starts both sides and lets them act together, round by round. */
async function race(file: string, scenario: string, cards: string[] = []) {
  const startAt = Date.now() + 2500; // time for both processes to start and load the cards
  const [a, b] = await Promise.all([runSide(file, scenario, "a", startAt, cards), runSide(file, scenario, "b", startAt, cards)]);
  return { a, b };
}

const choiceCards = ALL_CARDS.filter((c) => c.kind === "choice").map((c) => c.id);
const rounds = Array.from({ length: ROUNDS }, (_, i) => i);

describe("two processes racing on one database file", { timeout: 90_000 }, () => {
  let dir: string;
  let file: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "reconcile-race-"));
    file = path.join(dir, "board.db");
    db = openDb(file);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const addPlayer = (id: string) =>
    db.prepare("INSERT INTO players (id, nickname, nickname_key, created_at) VALUES (?, ?, ?, 0)").run(id, id, id);
  const openAttempt = (token: string, playerId: string, issuedAt: number) =>
    db.prepare("INSERT INTO attempts (token, player_id, card_ids, seed, issued_at) VALUES (?, ?, ?, 1, ?)").run(token, playerId, JSON.stringify(choiceCards.slice(0, 2)), issuedAt);

  it("gives each contested nickname to exactly one of two simultaneous claims", async () => {
    const { a, b } = await race(file, "claim");
    for (const round of rounds) expect([a[round].status, b[round].status].sort(), `round ${round}: ${a[round].detail ?? b[round].detail ?? ""}`).toEqual([200, 409]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM players").get()).toEqual({ n: ROUNDS });
  });

  it("opens exactly one run when two processes compete for a player's last open slot", async () => {
    exclusively(db, () => {
      for (const round of rounds) {
        addPlayer(`p-${round}`);
        for (let i = 0; i < MAX_OPEN_ATTEMPTS - 1; i++) openAttempt(`t-${round}-${i}`, `p-${round}`, Date.now());
      }
    });
    const { a, b } = await race(file, "last-slot", choiceCards.slice(0, 2));
    for (const round of rounds) expect([a[round].status, b[round].status].sort(), `round ${round}: ${a[round].detail ?? b[round].detail ?? ""}`).toEqual([200, 429]);
    const open = db.prepare("SELECT COUNT(*) AS n FROM attempts WHERE used_at IS NULL GROUP BY player_id").all() as { n: number }[];
    expect(new Set(open.map((r) => r.n))).toEqual(new Set([MAX_OPEN_ATTEMPTS]));
  });

  describe("when the player is deleted at the same moment", () => {
    const answers = (outcomes: Outcome[]) => outcomes.map((o) => o.status);
    const orphans = () => db.prepare("SELECT (SELECT COUNT(*) FROM attempts WHERE player_id NOT IN (SELECT id FROM players)) + (SELECT COUNT(*) FROM credits WHERE player_id NOT IN (SELECT id FROM players)) AS n").get();

    it("answers a run that is opened with a status, never an error", async () => {
      for (const round of rounds) addPlayer(`p-${round}`);
      const { a, b } = await race(file, "start-or-delete", choiceCards.slice(0, 2));
      expect(answers(a).every((s) => s === 200 || s === 401), JSON.stringify(a.filter((o) => o.status === "threw"))).toBe(true);
      expect(answers(b)).toEqual(rounds.map(() => 200));
      expect(orphans()).toEqual({ n: 0 });
    });

    it("answers a run that is scored with a status, never an error, and leaves no credit behind", async () => {
      exclusively(db, () => {
        for (const round of rounds) {
          addPlayer(`p-${round}`);
          openAttempt(`t-${round}`, `p-${round}`, Date.now() - 3_600_000);
        }
      });
      const { a, b } = await race(file, "submit-or-delete", choiceCards.slice(0, 2));
      expect(answers(a).every((s) => s === 200 || s === 401), JSON.stringify(a.filter((o) => o.status === "threw"))).toBe(true);
      expect(answers(b)).toEqual(rounds.map(() => 200));
      expect(orphans()).toEqual({ n: 0 });
    });

    it("answers a report about them with a status, never an error", async () => {
      addPlayer("reporter");
      db.prepare("INSERT INTO credits (player_id, card_id, day, points, at) VALUES ('reporter', 'c', '2026-10-07', 10, 0)").run();
      for (const round of rounds) addPlayer(`p-${round}`);
      const { a, b } = await race(file, "report-or-delete");
      expect(answers(a).every((s) => s === 200 || s === 404), JSON.stringify(a.filter((o) => o.status === "threw"))).toBe(true);
      expect(answers(b)).toEqual(rounds.map(() => 200));
      expect(db.prepare("SELECT COUNT(*) AS n FROM reports WHERE player_id NOT IN (SELECT id FROM players)").get()).toEqual({ n: 0 });
    });
  });
});
