import { ledger } from "./ledger";
import { notes } from "./notes";
import { ops } from "./ops";
import { orm } from "./orm";
import type { Card, Level, Track } from "./types";
import { versions } from "./versions";

export const TRACKS: Track[] = [ledger, orm, versions, notes, ops];

export const ALL_LEVELS: Level[] = TRACKS.flatMap((t) => t.levels);
export const ALL_CARDS: Card[] = ALL_LEVELS.flatMap((l) => l.cards);

/** Progress, the server's card lookup, and routing are keyed by id.
 * A duplicate would silently shadow a card.
 */
function requireUnique(kind: string, ids: string[]) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate ${kind} id: ${id}`);
    seen.add(id);
  }
}

requireUnique(
  "level",
  ALL_LEVELS.map((l) => l.id),
);
requireUnique(
  "card",
  ALL_CARDS.map((c) => c.id),
);

export function findLevel(
  id: string,
): { track: Track; level: Level; index: number } | undefined {
  for (const track of TRACKS) {
    const index = track.levels.findIndex((l) => l.id === id);
    if (index >= 0) return { track, level: track.levels[index], index };
  }
}

export function cardsForConcept(slug: string): Card[] {
  return ALL_CARDS.filter((c) => c.concept === slug);
}
