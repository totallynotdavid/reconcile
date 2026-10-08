import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ALL_CARDS } from "@/content";
import { judge } from "@/learning/judge";
import { prepare } from "@/learning/session";
import { ids, rightChoice as right, wrongChoice as wrong } from "@/test/cards";
import {
  ATTEMPT_TTL,
  HIDE_AT_REPORTS,
  MAX_OPEN_ATTEMPTS,
  MIN_MS_PER_CARD,
  POINTS_PER_CARD,
  type Done,
  createPlayer,
  deletePlayer,
  flagged,
  moderate,
  renamePlayer,
  report,
  standings,
  startAttempt,
  submitAttempt,
  weekStart,
} from "./board";
import { type Db, openDb } from "./db";

const T0 = Date.UTC(2026, 9, 7, 12, 0, 0); // Wednesday
const DAY = 86_400_000;
const SEED = 1234;

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});

function ok<T extends object>(result: Done<T>): Extract<Done<T>, { ok: true }> {
  if (!result.ok) throw new Error(`${result.status}: ${result.error}`);
  return result;
}

const join = (nickname: string, now = T0) => ok(createPlayer(db, nickname, now)).player;

const rightChoice = (id: string, seed = SEED) => right(id, seed);
const wrongChoice = (id: string, seed = SEED) => wrong(id, seed);

/** Plays `cards` honestly, with `right` of them answered correctly, and returns the submit result. */
function play(playerId: string, cards: string[], right: number, now: number, seed = SEED) {
  const { token } = ok(startAttempt(db, playerId, cards, seed, now));
  const picks = cards.map((id, i) => ({ id, choice: i < right ? rightChoice(id, seed) : wrongChoice(id, seed) }));
  return submitAttempt(db, playerId, token, { picks }, now + MIN_MS_PER_CARD * cards.length);
}

describe("choosing a nickname", () => {
  it("accepts a plain name and keeps its spelling", () => {
    expect(join("Ada Lovelace").nickname).toBe("Ada Lovelace");
  });

  it("rejects the same name in another case, spacing or separator, so nobody can pose as another player", () => {
    join("Ada Lovelace");
    for (const copy of ["ada lovelace", "ADA_LOVELACE", "ada.lovelace", "AdaLovelace"]) {
      const result = createPlayer(db, copy, T0);
      expect(result).toMatchObject({ ok: false, status: 409 });
    }
  });

  it("rejects names that are too short, too long, outside ASCII or abusive", () => {
    for (const bad of ["ab", "x".repeat(21), "Ünï", "名前だよ", "zero​width", " _hidden", "FUCK you", "n4zi", 7, null]) {
      expect(createPlayer(db, bad, T0).ok, String(bad)).toBe(false);
    }
  });

  it("lets a player rename to a free name and refuses a taken one", () => {
    const ada = join("Ada Lovelace");
    join("Grace Hopper");
    expect(renamePlayer(db, ada.id, "grace hopper")).toMatchObject({ ok: false, status: 409 });
    expect(ok(renamePlayer(db, ada.id, "Ada L")).player.nickname).toBe("Ada L");
    expect(ok(renamePlayer(db, ada.id, "ADA L")).player.nickname).toBe("ADA L");
  });
});

describe("scoring a run", () => {
  it("awards points for the answers the server judges right, whatever the client believes", () => {
    const ada = join("Ada Lovelace");
    const result = ok(play(ada.id, ids(8), 6, T0));
    expect(result).toMatchObject({ correct: 6, total: 8, points: 6 * POINTS_PER_CARD });
  });

  it("agrees with the player-facing check on every card", () => {
    for (const card of ALL_CARDS) {
      expect(judge(card, SEED, rightChoice(card.id)), card.id).toBe(true);
      expect(judge(card, SEED, wrongChoice(card.id)), card.id).toBe(false);
    }
  });

  it("scores by the options as shuffled for the seed, not by the card's stored answer", () => {
    const card = ALL_CARDS.find((c) => c.kind === "choice")!;
    const picks = new Set<number>();
    for (let seed = 1; seed < 40; seed++) picks.add(rightChoice(card.id, seed)[0]);
    expect(picks.size).toBeGreaterThan(1);
    const seed = 7;
    const ada = join("Ada Lovelace");
    const { token } = ok(startAttempt(db, ada.id, [card.id], seed, T0));
    const shown = prepare(card, seed);
    if (shown.kind !== "choice") throw new Error("expected a choice card");
    const stored = card.kind === "choice" ? card.answer : -1;
    const submit = submitAttempt(db, ada.id, token, { picks: [{ id: card.id, choice: [stored] }] }, T0 + MIN_MS_PER_CARD);
    expect(ok(submit).correct).toBe(shown.answer === stored ? 1 : 0);
  });

  it("scores a triage card right only when every step is right", () => {
    const triage = ALL_CARDS.find((c) => c.kind === "triage")!;
    const ada = join("Ada Lovelace");
    const steps = rightChoice(triage.id).length;
    expect(steps).toBeGreaterThan(1);
    const slip = rightChoice(triage.id);
    slip[steps - 1] = wrongChoice(triage.id)[steps - 1];
    const { token } = ok(startAttempt(db, ada.id, [triage.id], SEED, T0));
    const submit = submitAttempt(db, ada.id, token, { picks: [{ id: triage.id, choice: slip }] }, T0 + MIN_MS_PER_CARD);
    expect(ok(submit).correct).toBe(0);
  });

  it("pays a card once per day: the same level again on the same day adds nothing", () => {
    const ada = join("Ada Lovelace");
    expect(ok(play(ada.id, ids(5), 5, T0)).points).toBe(50);
    expect(ok(play(ada.id, ids(5), 5, T0 + 60_000)).points).toBe(0);
    expect(ok(play(ada.id, ids(7), 7, T0 + 120_000)).points).toBe(20);
    expect(standings(db, "all", ada.id, T0).me?.points).toBe(70);
  });

  it("pays the card again on the next day", () => {
    const ada = join("Ada Lovelace");
    ok(play(ada.id, ids(5), 5, T0));
    expect(ok(play(ada.id, ids(5), 5, T0 + DAY)).points).toBe(50);
  });

  it("credits a card missed first and answered right on a retry the same day", () => {
    const ada = join("Ada Lovelace");
    expect(ok(play(ada.id, ids(4), 0, T0)).points).toBe(0);
    expect(ok(play(ada.id, ids(4), 4, T0 + 60_000)).points).toBe(40);
  });

  it("scores a run once: a replay of the same token is refused", () => {
    const ada = join("Ada Lovelace");
    const cards = ids(4);
    const { token } = ok(startAttempt(db, ada.id, cards, SEED, T0));
    const body = { picks: cards.map((id) => ({ id, choice: rightChoice(id) })) };
    const at = T0 + MIN_MS_PER_CARD * 4;
    expect(ok(submitAttempt(db, ada.id, token, body, at)).points).toBe(40);
    expect(submitAttempt(db, ada.id, token, body, at)).toMatchObject({ ok: false, status: 409 });
    expect(standings(db, "all", ada.id, at).me?.points).toBe(40);
  });

  it("refuses a run that was finished faster than it can be read", () => {
    const ada = join("Ada Lovelace");
    const cards = ids(6);
    const { token } = ok(startAttempt(db, ada.id, cards, SEED, T0));
    const body = { picks: cards.map((id) => ({ id, choice: rightChoice(id) })) };
    expect(submitAttempt(db, ada.id, token, body, T0 + 500)).toMatchObject({ ok: false, status: 422 });
    expect(standings(db, "all", ada.id, T0).me?.points).toBe(0);
  });

  it("refuses an expired run", () => {
    const ada = join("Ada Lovelace");
    const cards = ids(4);
    const { token } = ok(startAttempt(db, ada.id, cards, SEED, T0));
    const body = { picks: cards.map((id) => ({ id, choice: rightChoice(id) })) };
    expect(submitAttempt(db, ada.id, token, body, T0 + ATTEMPT_TTL + 1)).toMatchObject({ ok: false, status: 410 });
  });

  it("refuses another player's token", () => {
    const ada = join("Ada Lovelace");
    const grace = join("Grace Hopper");
    const cards = ids(4);
    const { token } = ok(startAttempt(db, ada.id, cards, SEED, T0));
    const body = { picks: cards.map((id) => ({ id, choice: rightChoice(id) })) };
    expect(submitAttempt(db, grace.id, token, body, T0 + 60_000)).toMatchObject({ ok: false, status: 404 });
  });

  it("refuses picks that do not match the cards the attempt opened with", () => {
    const ada = join("Ada Lovelace");
    const cards = ids(4);
    const at = T0 + 60_000;
    const open = () => ok(startAttempt(db, ada.id, cards, SEED, T0)).token;
    const pick = (id: string) => ({ id, choice: rightChoice(id) });
    const bad = [
      { picks: cards.slice(0, 3).map(pick) }, // a card left out
      { picks: [...cards.map(pick), pick(ids(1, 9)[0])] }, // a card added
      { picks: [...cards.slice(0, 3), cards[0]].map(pick) }, // a card twice
      { picks: [pick(cards[0]), pick(cards[1]), pick(cards[2]), { id: cards[3], choice: [99] }] }, // out of range
      { picks: [pick(cards[0]), pick(cards[1]), pick(cards[2]), { id: cards[3], choice: "0" }] }, // wrong type
      {},
    ];
    for (const body of bad) expect(submitAttempt(db, ada.id, open(), body, at)).toMatchObject({ ok: false, status: 400 });
    expect(standings(db, "all", ada.id, at).me?.points).toBe(0);
  });

  it("does not trust a verdict or a score sent along with the picks", () => {
    const ada = join("Ada Lovelace");
    const cards = ids(4);
    const { token } = ok(startAttempt(db, ada.id, cards, SEED, T0));
    const picks = cards.map((id) => ({ id, choice: wrongChoice(id), correct: true, points: 9999 }));
    const result = submitAttempt(db, ada.id, token, { picks, score: 9999 } as never, T0 + 60_000);
    expect(ok(result)).toMatchObject({ correct: 0, points: 0 });
  });

  it("judges the picks against the seed the attempt opened with, whatever the submit says", () => {
    const { card, opened, other } = (() => {
      for (const c of ALL_CARDS.filter((x) => x.kind === "choice")) {
        for (let s = 1; s < 50; s++) if (rightChoice(c.id, s)[0] !== rightChoice(c.id, s + 1)[0]) return { card: c.id, opened: s, other: s + 1 };
      }
      throw new Error("no card changes its answer between two seeds");
    })();
    const ada = join("Ada Lovelace");
    const second = join("Grace Hopper");
    const at = T0 + MIN_MS_PER_CARD;
    const forOther = ok(startAttempt(db, ada.id, [card], opened, T0));
    const replayed = submitAttempt(db, ada.id, forOther.token, { seed: other, picks: [{ id: card, choice: rightChoice(card, other) }] } as never, at);
    expect(ok(replayed).correct).toBe(0);
    const forOpened = ok(startAttempt(db, second.id, [card], opened, T0));
    expect(ok(submitAttempt(db, second.id, forOpened.token, { seed: other, picks: [{ id: card, choice: rightChoice(card, opened) }] } as never, at)).correct).toBe(1);
  });

  it("opens attempts only for known, distinct cards and a real seed, and caps the open ones", () => {
    const ada = join("Ada Lovelace");
    expect(startAttempt(db, ada.id, ["no-such-card"], SEED, T0)).toMatchObject({ ok: false, status: 400 });
    expect(startAttempt(db, ada.id, [ids(1)[0], ids(1)[0]], SEED, T0)).toMatchObject({ ok: false, status: 400 });
    expect(startAttempt(db, ada.id, [], SEED, T0)).toMatchObject({ ok: false, status: 400 });
    expect(startAttempt(db, ada.id, ids(26), SEED, T0)).toMatchObject({ ok: false, status: 400 });
    for (const seed of [-1, 1.5, "7", null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
      expect(startAttempt(db, ada.id, ids(2), seed, T0), String(seed)).toMatchObject({ ok: false, status: 400 });
    }
    for (let i = 0; i < MAX_OPEN_ATTEMPTS; i++) ok(startAttempt(db, ada.id, ids(2), SEED, T0));
    expect(startAttempt(db, ada.id, ids(2), SEED, T0)).toMatchObject({ ok: false, status: 429 });
    expect(startAttempt(db, "nobody", ids(2), SEED, T0)).toMatchObject({ ok: false, status: 401 });
  });
});

describe("ranking", () => {
  /** Gives a player exactly `cards` right answers on the given day. */
  function earn(name: string, cards: number, now: number) {
    const player = createPlayer(db, name, now);
    const id = player.ok ? player.player.id : (db.prepare("SELECT id FROM players WHERE nickname = ?").get(name) as { id: string }).id;
    ok(play(id, ids(cards), cards, now));
    return id;
  }

  it("orders by points, highest first, and numbers the places", () => {
    earn("Low", 2, T0);
    earn("High", 9, T0);
    earn("Mid", 5, T0);
    const board = standings(db, "all", null, T0 + DAY);
    expect(board.entries.map((e) => [e.rank, e.nickname, e.points])).toEqual([
      [1, "High", 90],
      [2, "Mid", 50],
      [3, "Low", 20],
    ]);
  });

  it("gives equal points to whoever reached them first", () => {
    earn("Second", 4, T0 + 60_000);
    earn("First", 4, T0);
    expect(standings(db, "all", null, T0 + DAY).entries.map((e) => e.nickname)).toEqual(["First", "Second"]);
  });

  it("tells a player their own rank, including when they are below the top 50", () => {
    for (let i = 0; i < 55; i++) {
      const id = join(`Player ${String(i).padStart(2, "0")}`).id;
      ok(play(id, ids(4), 4, T0 + i * 1000));
    }
    const last = join("Behind").id;
    ok(play(last, ids(2), 2, T0));
    const board = standings(db, "all", last, T0 + DAY);
    expect(board.entries).toHaveLength(50);
    expect(board.entries.some((e) => e.you)).toBe(false);
    expect(board.me).toMatchObject({ nickname: "Behind", rank: 56, points: 20 });
  });

  it("marks the caller's line in the list and reports no rank before the first point", () => {
    const ada = earn("Ada", 3, T0);
    const fresh = join("Fresh").id;
    expect(standings(db, "all", ada, T0).entries[0]).toMatchObject({ nickname: "Ada", you: true });
    expect(standings(db, "all", fresh, T0).me).toMatchObject({ nickname: "Fresh", rank: null, points: 0 });
    expect(standings(db, "all", null, T0).me).toBeNull();
  });

  it("keeps the weekly board to this week and the all-time board to everything", () => {
    expect(new Date(weekStart(T0)).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    const lastWeek = T0 - 7 * DAY;
    const veteran = join("Veteran", lastWeek).id;
    ok(play(veteran, ids(10), 10, lastWeek));
    const newcomer = join("Newcomer").id;
    ok(play(newcomer, ids(3), 3, T0));

    const week = standings(db, "week", veteran, T0);
    expect(week.entries.map((e) => [e.nickname, e.points])).toEqual([["Newcomer", 30]]);
    expect(week.me).toMatchObject({ rank: null, points: 0 });
    expect(week.resetsAt).toBe(Date.UTC(2026, 9, 12));

    const all = standings(db, "all", veteran, T0);
    expect(all.entries.map((e) => [e.rank, e.nickname, e.points])).toEqual([
      [1, "Veteran", 100],
      [2, "Newcomer", 30],
    ]);
    expect(all.resetsAt).toBeNull();
  });

  it("counts Sunday night in the week that is ending and Monday morning in the next", () => {
    const sunday = Date.UTC(2026, 9, 11, 23, 59, 0);
    const monday = Date.UTC(2026, 9, 12, 0, 1, 0);
    const ada = join("Ada", sunday).id;
    ok(play(ada, ids(2), 2, sunday - 60_000));
    expect(standings(db, "week", ada, sunday).me?.points).toBe(20);
    ok(play(ada, ids(4), 4, monday));
    expect(standings(db, "week", ada, monday).me?.points).toBe(40);
    expect(standings(db, "all", ada, monday).me?.points).toBe(60);
  });
});

describe("moderation", () => {
  function veteran(name: string) {
    const id = join(name).id;
    ok(play(id, ids(2), 2, T0));
    return id;
  }

  it("hides a player after enough different reporters and takes them off both boards", () => {
    const rude = veteran("Rude");
    const reporters = Array.from({ length: HIDE_AT_REPORTS }, (_, i) => veteran(`Reporter ${i}`));
    reporters.forEach((r, i) => {
      const result = ok(report(db, r, rude, "bad name", T0 + i));
      expect(result.hidden).toBe(i === HIDE_AT_REPORTS - 1);
    });
    for (const period of ["all", "week"] as const) {
      expect(standings(db, period, null, T0 + 1000).entries.map((e) => e.nickname)).not.toContain("Rude");
    }
    expect(standings(db, "all", rude, T0 + 1000).me).toMatchObject({ hidden: true, rank: null });
  });

  it("counts one report per reporter", () => {
    const rude = veteran("Rude");
    const one = veteran("Reporter");
    for (let i = 0; i < 5; i++) ok(report(db, one, rude, null, T0 + i));
    expect(flagged(db)[0]).toMatchObject({ nickname: "Rude", reports: 1, hidden: false });
  });

  it("does not let a player with no points report, or report themself", () => {
    const rude = veteran("Rude");
    const fresh = join("Fresh").id;
    expect(report(db, fresh, rude, null, T0)).toMatchObject({ ok: false, status: 403 });
    expect(report(db, rude, rude, null, T0)).toMatchObject({ ok: false, status: 400 });
    expect(report(db, rude, "nobody", null, T0)).toMatchObject({ ok: false, status: 404 });
  });

  it("refuses a report about a hidden player, from a stale entry, and records nothing", () => {
    const rude = veteran("Rude");
    const reporters = Array.from({ length: HIDE_AT_REPORTS + 1 }, (_, i) => veteran(`Reporter ${i}`));
    for (const r of reporters.slice(0, HIDE_AT_REPORTS)) ok(report(db, r, rude, null, T0));
    expect(report(db, reporters[HIDE_AT_REPORTS], rude, "late", T0)).toMatchObject({ ok: false, status: 404 });
    expect(flagged(db)[0]).toMatchObject({ nickname: "Rude", hidden: true, reports: HIDE_AT_REPORTS });
    ok(moderate(db, rude, "hide"));
    expect(report(db, reporters[HIDE_AT_REPORTS], rude, "late", T0)).toMatchObject({ ok: false, status: 404 });
  });

  it("dismisses the reports against a player who is not hidden when a moderator restores them", () => {
    const rude = veteran("Rude");
    const one = veteran("Reporter");
    ok(report(db, one, rude, null, T0));
    ok(moderate(db, rude, "unhide"));
    expect(flagged(db)).toEqual([]);
  });

  it("stops a hidden player from earning more until a moderator restores them", () => {
    const rude = veteran("Rude");
    expect(ok(moderate(db, rude, "hide")).done).toBe("hide");
    expect(startAttempt(db, rude, ids(2), SEED, T0)).toMatchObject({ ok: false, status: 403 });
    ok(moderate(db, rude, "unhide"));
    expect(startAttempt(db, rude, ids(2), SEED, T0).ok).toBe(true);
    expect(standings(db, "all", null, T0).entries.map((e) => e.nickname)).toContain("Rude");
  });

  it("clears the reports when a moderator restores a player, so one more does not hide them again", () => {
    const rude = veteran("Rude");
    const reporters = Array.from({ length: HIDE_AT_REPORTS }, (_, i) => veteran(`Reporter ${i}`));
    for (const r of reporters) ok(report(db, r, rude, null, T0));
    ok(moderate(db, rude, "unhide"));
    expect(ok(report(db, reporters[0], rude, null, T0)).hidden).toBe(false);
  });

  it("lists the reported and hidden players for a moderator, most reported first", () => {
    const a = veteran("Alpha");
    const b = veteran("Bravo");
    const r1 = veteran("Reporter One");
    const r2 = veteran("Reporter Two");
    ok(report(db, r1, b, "spam", T0));
    ok(report(db, r2, b, "rude", T0 + 1));
    ok(report(db, r1, a, null, T0 + 2));
    expect(flagged(db).map((f) => [f.nickname, f.reports, f.reasons])).toEqual([
      ["Bravo", 2, ["spam", "rude"]],
      ["Alpha", 1, []],
    ]);
  });

  it("deletes a player with their points, attempts and reports", () => {
    const rude = veteran("Rude");
    const other = veteran("Other");
    ok(report(db, other, rude, null, T0));
    ok(moderate(db, rude, "delete"));
    expect(standings(db, "all", null, T0).entries.map((e) => e.nickname)).toEqual(["Other"]);
    expect(flagged(db)).toEqual([]);
    expect(deletePlayer(db, rude)).toBe(false);
    expect(createPlayer(db, "Rude", T0).ok).toBe(true);
  });

  it("rejects an unknown verdict", () => {
    const id = veteran("Ada");
    expect(moderate(db, id, "ban")).toMatchObject({ ok: false, status: 400 });
  });
});

describe("two connections to one database", () => {
  let dir: string;
  let other: Db;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "reconcile-"));
    db = openDb(path.join(dir, "board.db"));
    other = openDb(path.join(dir, "board.db"));
  });

  afterEach(() => {
    db.close();
    other.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a rename onto a name another connection holds, without an error", () => {
    const ada = join("Ada Lovelace");
    ok(createPlayer(other, "Grace Hopper", T0));
    expect(renamePlayer(db, ada.id, "grace hopper")).toMatchObject({ ok: false, status: 409 });
    expect(renamePlayer(db, "missing", "Free Name")).toMatchObject({ ok: false, status: 404 });
  });

  it("answers for a player another connection deleted with a status, not an error", () => {
    const ada = join("Ada Lovelace");
    const reporter = join("Reporter One");
    ok(play(reporter.id, ids(1), 1, T0));
    const cards = ids(2);
    const { token } = ok(startAttempt(db, ada.id, cards, SEED, T0));
    other.prepare("DELETE FROM players WHERE id = ?").run(ada.id);
    const picks = cards.map((id) => ({ id, choice: rightChoice(id) }));
    expect(submitAttempt(db, ada.id, token, { picks }, T0 + MIN_MS_PER_CARD * 2)).toMatchObject({ ok: false, status: 401 });
    expect(startAttempt(db, ada.id, cards, SEED, T0)).toMatchObject({ ok: false, status: 401 });
    expect(report(db, reporter.id, ada.id, "rude", T0)).toMatchObject({ ok: false, status: 404 });
    expect(moderate(db, ada.id, "hide")).toMatchObject({ ok: false, status: 404 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM credits WHERE player_id = ?").get(ada.id)).toEqual({ n: 0 });
  });
});
