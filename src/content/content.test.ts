import { describe, expect, it } from "vitest";
import { ALL_CARDS, ALL_LEVELS } from ".";

describe("content", () => {
  it("has unique card ids, since progress is stored per id", () => {
    const ids = ALL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every level a sensible number of cards for one sitting", () => {
    for (const level of ALL_LEVELS) expect(level.cards.length).toBeGreaterThanOrEqual(4);
  });
});
