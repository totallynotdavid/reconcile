import { describe, expect, it } from "vitest";
import { DAY, dueConcepts, grade, passed } from "./leitner";

const now = 1_000_000_000_000;

describe("leitner", () => {
  it("moves a correct concept up one box and schedules it later", () => {
    const first = grade(undefined, true, now);
    expect(first.box).toBe(2);
    expect(first.due).toBe(now + DAY);
    expect(grade(first, true, now).box).toBe(3);
  });

  it("sends a wrong answer back to box 1, due now", () => {
    const high = { box: 5, due: now + 8 * DAY };
    expect(grade(high, false, now)).toEqual({ box: 1, due: now });
  });

  it("stops at the top box", () => {
    expect(grade({ box: 6, due: now }, true, now).box).toBe(6);
  });

  it("lists the weakest due concepts first and skips the ones not due", () => {
    const list = dueConcepts(
      {
        strong: { box: 4, due: now - 1 },
        weak: { box: 1, due: now - 5 },
        later: { box: 3, due: now + DAY },
      },
      now,
    );
    expect(list).toEqual(["weak", "strong"]);
  });

  it("passes at 80% and fails below", () => {
    expect(passed(4, 5)).toBe(true);
    expect(passed(3, 5)).toBe(false);
    expect(passed(0, 0)).toBe(false);
  });
});
