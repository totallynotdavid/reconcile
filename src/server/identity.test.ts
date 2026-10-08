import { describe, expect, it } from "vitest";
import { createLimiter } from "./limit";
import { sessionSecret, sign, verify } from "./identity";

const SECRET = "a".repeat(32);

describe("player cookie", () => {
  it("returns the player id for a value it signed", () => {
    expect(verify(sign("player-1", SECRET), SECRET)).toBe("player-1");
  });

  it("rejects another id under the same signature, a different secret, and malformed values", () => {
    const [, mac] = sign("player-1", SECRET).split(".");
    expect(verify(`player-2.${mac}`, SECRET)).toBeNull();
    expect(verify(sign("player-1", SECRET), "b".repeat(32))).toBeNull();
    for (const bad of [undefined, "", "player-1", "player-1.", ".mac", "player-1.short"]) expect(verify(bad, SECRET)).toBeNull();
  });
});

describe("session secret", () => {
  it("refuses to run in production without a real secret", () => {
    expect(() => sessionSecret({ NODE_ENV: "production" })).toThrow();
    expect(() => sessionSecret({ NODE_ENV: "production", SESSION_SECRET: "short" })).toThrow();
    expect(sessionSecret({ NODE_ENV: "production", SESSION_SECRET: SECRET })).toBe(SECRET);
  });

  it("falls back to a fixed value outside production so dev needs no setup", () => {
    expect(sessionSecret({})).toBe(sessionSecret({ NODE_ENV: "development" }));
  });
});

describe("rate limiter", () => {
  it("has room for up to the limit per window, then none until the window passes", () => {
    const limiter = createLimiter();
    const room = [] as boolean[];
    for (let i = 0; i < 5; i++) {
      room.push(limiter.room("join:a", 3, i));
      limiter.hit("join:a", 1000, i);
    }
    expect(room).toEqual([true, true, true, false, false]);
    expect(limiter.room("join:a", 3, 1000)).toBe(true);
  });

  it("counts only what is hit, so checking costs nothing", () => {
    const limiter = createLimiter();
    for (let i = 0; i < 10; i++) expect(limiter.room("join:a", 1, 0)).toBe(true);
    limiter.hit("join:a", 1000, 0);
    expect(limiter.room("join:a", 1, 1)).toBe(false);
  });

  it("counts each key on its own", () => {
    const limiter = createLimiter();
    limiter.hit("join:a", 1000, 0);
    expect(limiter.room("join:a", 1, 1)).toBe(false);
    expect(limiter.room("join:b", 1, 1)).toBe(true);
  });
});
