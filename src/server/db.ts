import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Shipped blocks never change. A schema change is a new entry. The index plus one is `user_version`. */
const MIGRATIONS = [
  `
  CREATE TABLE players (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    nickname_key TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE attempts (
    token TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    card_ids TEXT NOT NULL,
    seed INTEGER NOT NULL,
    issued_at INTEGER NOT NULL,
    used_at INTEGER,
    correct INTEGER,
    points INTEGER
  );
  CREATE INDEX attempts_player ON attempts (player_id, used_at);
  CREATE TABLE credits (
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL,
    day TEXT NOT NULL,
    points INTEGER NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (player_id, card_id, day)
  );
  CREATE INDEX credits_day ON credits (day);
  CREATE TABLE reports (
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    reporter_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    reason TEXT,
    at INTEGER NOT NULL,
    PRIMARY KEY (player_id, reporter_id)
  );
  `,
];

export type Db = DatabaseSync;

/** True when a write lost to a UNIQUE or PRIMARY KEY constraint, which another connection may have just won. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("UNIQUE constraint failed");
}

/**
 * Runs `work` as the only writer. A read that decides a write belongs inside it: another connection can
 * change the database between two separate statements, but not while this one holds the write lock.
 */
export function exclusively<T>(db: Db, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Opens a database and brings it to the latest schema. `:memory:` gives an empty one for tests. */
export function openDb(file: string): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout = 3000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  // The version is read under the write lock, so two processes starting together migrate once.
  exclusively(db, () => {
    const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
    for (let i = version; i < MIGRATIONS.length; i++) {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
    }
  });
  return db;
}

const globalDb = globalThis as typeof globalThis & { __reconcileDb?: Db };

/** One connection per process. It survives dev hot reloads. */
export function getDb(): Db {
  globalDb.__reconcileDb ??= openDb(process.env.DB_PATH ?? path.join(process.cwd(), "data", "reconcile.db"));
  return globalDb.__reconcileDb;
}

/** Closes the process's connection. The next `getDb` opens `DB_PATH` again. */
export function closeDb(): void {
  globalDb.__reconcileDb?.close();
  delete globalDb.__reconcileDb;
}
