import { ledger } from "./ledger";
import { ops } from "./ops";
import { orm } from "./orm";
import type { Card, Level, Track } from "./types";
import { versions } from "./versions";

export const TRACKS: Track[] = [ledger, orm, versions, ops];

export const ALL_LEVELS: Level[] = TRACKS.flatMap((t) => t.levels);
export const ALL_CARDS: Card[] = ALL_LEVELS.flatMap((l) => l.cards);

export function findLevel(id: string): { track: Track; level: Level; index: number } | undefined {
  for (const track of TRACKS) {
    const index = track.levels.findIndex((l) => l.id === id);
    if (index >= 0) return { track, level: track.levels[index], index };
  }
}

export function cardsForConcept(slug: string): Card[] {
  return ALL_CARDS.filter((c) => c.concept === slug);
}
