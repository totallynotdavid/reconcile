import { describe, expect, it } from "vitest";
import { DAY } from "./leitner";
import { emptyProgress, isUnlocked, recordExam, recordLevel, recordReview, stars } from "./progress";

const now = Date.UTC(2026, 9, 2);
const right = (concept: string) => ({ concept, correct: true });
const wrong = (concept: string) => ({ concept, correct: false });

describe("progress", () => {
  it("unlocks the next level only after passing at 80%", () => {
    const ids = ["a", "b", "c"];
    let data = emptyProgress();
    expect(isUnlocked(data, ids, 0)).toBe(true);
    expect(isUnlocked(data, ids, 1)).toBe(false);

    data = recordLevel(data, "a", [right("x"), right("x"), right("y"), wrong("y"), wrong("z")], now);
    expect(data.levels.a.passed).toBe(false);
    expect(isUnlocked(data, ids, 1)).toBe(false);

    data = recordLevel(data, "a", [right("x"), right("x"), right("y"), right("y"), wrong("z")], now);
    expect(data.levels.a).toMatchObject({ passed: true, best: 4, attempts: 2 });
    expect(isUnlocked(data, ids, 1)).toBe(true);
  });

  it("keeps a passed level passed after a worse retry", () => {
    let data = recordLevel(emptyProgress(), "a", [right("x"), right("x")], now);
    data = recordLevel(data, "a", [wrong("x"), wrong("x")], now);
    expect(data.levels.a.passed).toBe(true);
    expect(data.levels.a.best).toBe(2);
  });

  it("sends a missed concept back to box 1 and pushes a right one out", () => {
    const data = recordLevel(emptyProgress(), "a", [right("x"), wrong("y")], now);
    expect(data.concepts.x).toEqual({ box: 2, due: now + DAY });
    expect(data.concepts.y).toEqual({ box: 1, due: now });
  });

  it("counts a review day once and keeps the best exam", () => {
    let data = recordReview(emptyProgress(), [right("x")], now);
    data = recordReview(data, [right("x")], now + 1000);
    expect(data.reviews).toEqual(["2026-10-02"]);
    data = recordExam(data, [right("x"), right("y"), wrong("z")], now);
    data = recordExam(data, [right("x"), wrong("y"), wrong("z")], now);
    expect(data.exam).toEqual({ best: 2, total: 3 });
  });

  it("awards stars from the best run", () => {
    const result = (best: number, passed: boolean) => ({ best, total: 5, passed, attempts: 1 });
    expect(stars(undefined)).toBe(0);
    expect(stars(result(2, false))).toBe(0);
    expect(stars(result(3, false))).toBe(1);
    expect(stars(result(4, true))).toBe(2);
    expect(stars(result(5, true))).toBe(3);
  });
});
