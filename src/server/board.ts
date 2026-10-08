import { randomBytes, randomUUID } from "node:crypto";
import { ALL_CARDS } from "@/content";
import type { Card } from "@/content/types";
import { DAY } from "@/learning/leitner";
import { judge } from "@/learning/judge";
import { type Db, exclusively, isUniqueViolation } from "./db";
import { checkNickname, nicknameKey } from "./nickname";

export const POINTS_PER_CARD = 10;
/** No one reads a card, thinks and answers faster than this. A run quicker than it per card is a script. */
export const MIN_MS_PER_CARD = 2000;
export const ATTEMPT_TTL = 2 * 60 * 60 * 1000;
export const MAX_CARDS_PER_ATTEMPT = 25;
export const MAX_OPEN_ATTEMPTS = 20;
export const HIDE_AT_REPORTS = 3;
export const BOARD_SIZE = 50;

const CARDS = new Map<string, Card>(ALL_CARDS.map((c) => [c.id, c]));

export type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
export type Done<T> = ({ ok: true } & T) | Fail;

export type Player = { id: string; nickname: string; hidden: boolean };

type PlayerRow = { id: string; nickname: string; hidden: number };
const toPlayer = (row: PlayerRow): Player => ({ id: row.id, nickname: row.nickname, hidden: !!row.hidden });

export const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);

/** Weeks run Monday 00:00 UTC to the next Monday. */
export function weekStart(now: number): number {
  const d = new Date(now);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday);
}

export function getPlayer(db: Db, id: string): Player | null {
  const row = db.prepare("SELECT id, nickname, hidden FROM players WHERE id = ?").get(id) as PlayerRow | undefined;
  return row ? toPlayer(row) : null;
}

const taken = () => fail(409, "That nickname is taken.");

/** The UNIQUE key on `nickname_key` decides who gets a nickname, so there is no check to race against. */
export function createPlayer(db: Db, raw: unknown, now: number): Done<{ player: Player }> {
  const checked = checkNickname(raw);
  if (!checked.ok) return fail(400, checked.error);
  const id = randomUUID();
  try {
    db.prepare("INSERT INTO players (id, nickname, nickname_key, created_at) VALUES (?, ?, ?, ?)").run(
      id,
      checked.nickname,
      nicknameKey(checked.nickname),
      now,
    );
  } catch (error) {
    if (isUniqueViolation(error)) return taken();
    throw error;
  }
  return { ok: true, player: { id, nickname: checked.nickname, hidden: false } };
}

export function renamePlayer(db: Db, id: string, raw: unknown): Done<{ player: Player }> {
  const checked = checkNickname(raw);
  if (!checked.ok) return fail(400, checked.error);
  try {
    const { changes } = db.prepare("UPDATE players SET nickname = ?, nickname_key = ? WHERE id = ?").run(checked.nickname, nicknameKey(checked.nickname), id);
    if (changes !== 1) return fail(404, "Unknown player.");
  } catch (error) {
    if (isUniqueViolation(error)) return taken();
    throw error;
  }
  const player = getPlayer(db, id);
  return player ? { ok: true, player } : fail(404, "Unknown player.");
}

/** Removes the player and, by cascade, their credits, attempts and reports. */
export function deletePlayer(db: Db, id: string): boolean {
  return db.prepare("DELETE FROM players WHERE id = ?").run(id).changes === 1;
}

const validSeed = (seed: unknown): seed is number => Number.isSafeInteger(seed) && (seed as number) >= 0;

/**
 * Opens a timed attempt over the given cards and the seed they are drawn with. The seed is fixed here,
 * so the picks are judged against the run the player was shown. The clock starts here too, which is what
 * lets the server refuse a run that finished faster than a person can read.
 */
export function startAttempt(db: Db, playerId: string, cardIds: unknown, seed: unknown, now: number): Done<{ token: string }> {
  if (!Array.isArray(cardIds) || cardIds.length === 0 || cardIds.length > MAX_CARDS_PER_ATTEMPT) return fail(400, "Bad card list.");
  if (new Set(cardIds).size !== cardIds.length || !cardIds.every((id) => typeof id === "string" && CARDS.has(id))) {
    return fail(400, "Bad card list.");
  }
  if (!validSeed(seed)) return fail(400, "Bad seed.");
  return exclusively(db, (): Done<{ token: string }> => {
    const player = getPlayer(db, playerId);
    if (!player) return fail(401, "Unknown player.");
    if (player.hidden) return fail(403, "Your entry is hidden.");
    db.prepare("DELETE FROM attempts WHERE player_id = ? AND issued_at < ?").run(playerId, now - ATTEMPT_TTL);
    const open = db.prepare("SELECT COUNT(*) AS n FROM attempts WHERE player_id = ? AND used_at IS NULL").get(playerId) as { n: number };
    if (open.n >= MAX_OPEN_ATTEMPTS) return fail(429, "Too many unfinished runs.");
    const token = randomBytes(24).toString("base64url");
    db.prepare("INSERT INTO attempts (token, player_id, card_ids, seed, issued_at) VALUES (?, ?, ?, ?, ?)").run(token, playerId, JSON.stringify(cardIds), seed, now);
    return { ok: true, token };
  });
}

export type Pick = { id: string; choice: number[] };
export type Award = { correct: number; total: number; points: number };

type AttemptRow = { card_ids: string; seed: number; issued_at: number; used_at: number | null };

/**
 * Grades a finished attempt from the picks alone, against the seed it was opened with. The client never
 * states a score, a verdict or a seed. A card pays once per player per UTC day, so repeating a level
 * cannot grow the total.
 */
export function submitAttempt(db: Db, playerId: string, token: unknown, body: { picks?: unknown }, now: number): Done<Award> {
  const { picks } = body;
  if (typeof token !== "string" || !Array.isArray(picks)) return fail(400, "Bad run.");
  return exclusively(db, (): Done<Award> => {
    const player = getPlayer(db, playerId);
    if (!player) return fail(401, "Unknown player.");
    if (player.hidden) return fail(403, "Your entry is hidden.");
    const row = db.prepare("SELECT card_ids, seed, issued_at, used_at FROM attempts WHERE token = ? AND player_id = ?").get(token, playerId) as AttemptRow | undefined;
    if (!row) return fail(404, "Unknown run.");
    if (row.used_at !== null) return fail(409, "This run was already scored.");
    if (now - row.issued_at > ATTEMPT_TTL) return fail(410, "This run expired.");

    const issued: string[] = JSON.parse(row.card_ids);
    const seen = new Set<string>();
    for (const pick of picks as Pick[]) {
      if (!pick || typeof pick.id !== "string" || !issued.includes(pick.id) || seen.has(pick.id)) return fail(400, "Bad run.");
      seen.add(pick.id);
    }
    if (seen.size !== issued.length) return fail(400, "Bad run.");
    if (now - row.issued_at < MIN_MS_PER_CARD * issued.length) return fail(422, "That run was too fast to be read.");

    const right: string[] = [];
    for (const pick of picks as Pick[]) {
      const verdict = judge(CARDS.get(pick.id)!, row.seed, pick.choice);
      if (verdict === null) return fail(400, "Bad run.");
      if (verdict) right.push(pick.id);
    }

    db.prepare("UPDATE attempts SET used_at = ? WHERE token = ?").run(now, token);
    const credit = db.prepare("INSERT OR IGNORE INTO credits (player_id, card_id, day, points, at) VALUES (?, ?, ?, ?, ?)");
    let points = 0;
    for (const id of right) points += Number(credit.run(playerId, id, dayOf(now), POINTS_PER_CARD, now).changes) * POINTS_PER_CARD;
    db.prepare("UPDATE attempts SET correct = ?, points = ? WHERE token = ?").run(right.length, points, token);
    return { ok: true, correct: right.length, total: issued.length, points };
  });
}

export type Period = "all" | "week";
export type Entry = { id: string; rank: number; nickname: string; points: number; you: boolean };
export type Standings = {
  period: Period;
  entries: Entry[];
  /** The caller's own line, even when it is outside the top. Null rank means no points in the period. */
  me: { nickname: string; rank: number | null; points: number; hidden: boolean } | null;
  /** When the weekly board starts over. */
  resetsAt: number | null;
};

/**
 * Highest points first. Equal points go to whoever reached them first, so a rank is a distinct place.
 */
export function standings(db: Db, period: Period, playerId: string | null, now: number): Standings {
  const since = period === "week" ? dayOf(weekStart(now)) : "0000-00-00";
  const rows = db
    .prepare(
      `WITH totals AS (
         SELECT p.id, p.nickname, SUM(c.points) AS points, MAX(c.at) AS reached
         FROM credits c JOIN players p ON p.id = c.player_id
         WHERE p.hidden = 0 AND c.day >= ?
         GROUP BY p.id
       ), ranked AS (
         SELECT id, nickname, points, ROW_NUMBER() OVER (ORDER BY points DESC, reached ASC, id ASC) AS rank FROM totals
       )
       SELECT id, nickname, points, rank FROM ranked WHERE rank <= ? OR id = ? ORDER BY rank`,
    )
    .all(since, BOARD_SIZE, playerId ?? "") as { id: string; nickname: string; points: number; rank: number }[];

  const entries = rows
    .filter((r) => r.rank <= BOARD_SIZE)
    .map((r) => ({ id: r.id, rank: r.rank, nickname: r.nickname, points: r.points, you: r.id === playerId }));
  const player = playerId ? getPlayer(db, playerId) : null;
  const own = rows.find((r) => r.id === playerId);
  return {
    period,
    entries,
    me: player ? { nickname: player.nickname, rank: own?.rank ?? null, points: own?.points ?? 0, hidden: player.hidden } : null,
    resetsAt: period === "week" ? weekStart(now) + 7 * DAY : null,
  };
}

/**
 * Only players who have earned points may report, so a fresh throwaway identity cannot hide anyone.
 * Enough distinct reporters hide the entry until a moderator decides.
 */
export function report(db: Db, reporterId: string, targetId: unknown, reason: unknown, now: number): Done<{ hidden: boolean }> {
  if (typeof targetId !== "string") return fail(400, "Bad report.");
  if (targetId === reporterId) return fail(400, "You cannot report yourself.");
  const text = typeof reason === "string" ? reason.trim().slice(0, 200) || null : null;
  return exclusively(db, (): Done<{ hidden: boolean }> => {
    const reporter = getPlayer(db, reporterId);
    if (!reporter || reporter.hidden) return fail(403, "You cannot report.");
    const played = db.prepare("SELECT 1 AS yes FROM credits WHERE player_id = ? LIMIT 1").get(reporterId);
    if (!played) return fail(403, "Earn a point before reporting.");
    // A hidden entry is off the boards, so it is not something a player can be looking at.
    const target = getPlayer(db, targetId);
    if (!target || target.hidden) return fail(404, "Unknown player.");
    db.prepare("INSERT OR IGNORE INTO reports (player_id, reporter_id, reason, at) VALUES (?, ?, ?, ?)").run(targetId, reporterId, text, now);
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM reports WHERE player_id = ?").get(targetId) as { n: number };
    const hidden = n >= HIDE_AT_REPORTS;
    if (hidden) db.prepare("UPDATE players SET hidden = 1 WHERE id = ?").run(targetId);
    return { ok: true, hidden };
  });
}

export type Flagged = { id: string; nickname: string; hidden: boolean; reports: number; points: number; reasons: string[] };

/** Players someone reported or a moderator hid, most reported first. */
export function flagged(db: Db): Flagged[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.nickname, p.hidden,
         (SELECT COUNT(*) FROM reports r WHERE r.player_id = p.id) AS reports,
         COALESCE((SELECT SUM(points) FROM credits c WHERE c.player_id = p.id), 0) AS points
       FROM players p
       WHERE p.hidden = 1 OR EXISTS (SELECT 1 FROM reports r WHERE r.player_id = p.id)
       ORDER BY reports DESC, p.created_at`,
    )
    .all() as { id: string; nickname: string; hidden: number; reports: number; points: number }[];
  const reasons = db.prepare("SELECT reason FROM reports WHERE player_id = ? AND reason IS NOT NULL ORDER BY at");
  return rows.map((r) => ({
    ...r,
    hidden: !!r.hidden,
    reasons: (reasons.all(r.id) as { reason: string }[]).map((x) => x.reason),
  }));
}

export type Verdict = "hide" | "unhide" | "delete";

/**
 * Unhiding clears the reports against the player, or the next one would hide them again at once. On a
 * player who is not hidden it dismisses the reports.
 */
export function moderate(db: Db, id: unknown, verdict: unknown): Done<{ done: Verdict }> {
  if (typeof id !== "string" || !["hide", "unhide", "delete"].includes(verdict as string)) return fail(400, "Bad request.");
  return exclusively(db, (): Done<{ done: Verdict }> => {
    if (!getPlayer(db, id)) return fail(404, "Unknown player.");
    if (verdict === "delete") deletePlayer(db, id);
    else if (verdict === "hide") db.prepare("UPDATE players SET hidden = 1 WHERE id = ?").run(id);
    else {
      db.prepare("UPDATE players SET hidden = 0 WHERE id = ?").run(id);
      db.prepare("DELETE FROM reports WHERE player_id = ?").run(id);
    }
    return { ok: true, done: verdict as Verdict };
  });
}
