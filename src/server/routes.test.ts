import { describe, expect, it, vi } from "vitest";
import { ids, rightChoice, wrongChoice } from "@/test/cards";
import { ADMIN_TOKEN, browser, later, moderator, useRoutes } from "@/test/routes";
import { COOKIE } from "./identity";
import { LIMITS } from "./http";
import { MIN_MS_PER_CARD } from "./board";

const SEED = 99;

useRoutes();

const join = async (visitor: ReturnType<typeof browser>, nickname: string) => {
  const res = await visitor.send("/api/players/", { nickname });
  expect(res.status, nickname).toBe(201);
  return ((await res.json()) as { player: { id: string } }).player.id;
};

/** Plays `cards` through the routes and returns the scoring reply. */
async function play(visitor: ReturnType<typeof browser>, cards: string[], right: number, seed = SEED) {
  const started = await visitor.send("/api/attempts/", { cardIds: cards, seed });
  expect(started.status).toBe(201);
  const { token } = (await started.json()) as { token: string };
  later(MIN_MS_PER_CARD * cards.length);
  const picks = cards.map((id, i) => ({ id, choice: i < right ? rightChoice(id, seed) : wrongChoice(id, seed) }));
  return visitor.send(`/api/attempts/${token}/`, { picks });
}

describe("scoring through the routes", () => {
  it("scores a run from its picks and ranks the player on both boards", async () => {
    const ada = browser();
    await join(ada, "Ada Lovelace");
    const res = await play(ada, ids(4), 3);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      correct: 3,
      total: 4,
      points: 30,
      week: { nickname: "Ada Lovelace", rank: 1, points: 30 },
      all: { nickname: "Ada Lovelace", rank: 1, points: 30 },
    });
    const board = (await (await ada.get("/api/leaderboard/?period=week")).json()) as { entries: { nickname: string; you: boolean }[] };
    expect(board.entries).toMatchObject([{ nickname: "Ada Lovelace", you: true }]);
  });

  it("ignores a score, a verdict or a seed that the client adds to the picks", async () => {
    const ada = browser();
    await join(ada, "Ada Lovelace");
    const cards = ids(3);
    const { token } = (await (await ada.send("/api/attempts/", { cardIds: cards, seed: SEED })).json()) as { token: string };
    later(MIN_MS_PER_CARD * 3);
    const picks = cards.map((id) => ({ id, choice: wrongChoice(id, SEED), correct: true, points: 9999 }));
    const res = await ada.send(`/api/attempts/${token}/`, { picks, score: 9999, points: 9999, seed: SEED + 1 });
    expect(await res.json()).toMatchObject({ correct: 0, points: 0 });
  });

  it("refuses a replay, a run read too fast, and another player's token", async () => {
    const ada = browser();
    const grace = browser();
    await join(ada, "Ada Lovelace");
    await join(grace, "Grace Hopper");
    const cards = ids(3);
    const picks = cards.map((id) => ({ id, choice: rightChoice(id, SEED) }));
    const open = async () => ((await (await ada.send("/api/attempts/", { cardIds: cards, seed: SEED })).json()) as { token: string }).token;

    const fast = await open();
    expect((await ada.send(`/api/attempts/${fast}/`, { picks })).status).toBe(422);
    later(MIN_MS_PER_CARD * 3);
    expect((await grace.send(`/api/attempts/${fast}/`, { picks })).status).toBe(404);
    expect((await ada.send(`/api/attempts/${fast}/`, { picks })).status).toBe(200);
    expect((await ada.send(`/api/attempts/${fast}/`, { picks })).status).toBe(409);
  });

  it("refuses a request without a player cookie, with a forged one, or from another site", async () => {
    const ada = browser();
    await join(ada, "Ada Lovelace");
    const stranger = browser();
    expect((await stranger.send("/api/attempts/", { cardIds: ids(2), seed: SEED })).status).toBe(401);

    const forged = browser();
    forged.cookie = ada.cookie.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    expect((await forged.send("/api/attempts/", { cardIds: ids(2), seed: SEED })).status).toBe(401);

    const elsewhere = browser({ headers: { Origin: "https://evil.example" } });
    elsewhere.cookie = ada.cookie;
    expect((await elsewhere.send("/api/attempts/", { cardIds: ids(2), seed: SEED })).status).toBe(400);
    expect(ada.cookie).toContain(COOKIE);
  });

  it("tells a hidden player their entry is hidden, and a reporter cannot add to a hidden entry", async () => {
    const rude = browser();
    const rudeId = await join(rude, "Rude");
    const reporters = [browser(), browser(), browser(), browser()];
    for (const [i, reporter] of reporters.entries()) {
      await join(reporter, `Reporter ${i}`);
      expect((await play(reporter, ids(1), 1)).status).toBe(200);
    }
    for (const reporter of reporters.slice(0, 3)) {
      expect((await reporter.send("/api/reports/", { playerId: rudeId, reason: "rude" })).status).toBe(200);
    }
    expect((await rude.send("/api/attempts/", { cardIds: ids(1), seed: SEED })).status).toBe(403);
    expect((await reporters[3].send("/api/reports/", { playerId: rudeId, reason: "late" })).status).toBe(404);
    const listed = (await (await moderator(ADMIN_TOKEN)).json()) as { players: { nickname: string; reports: number; hidden: boolean }[] };
    expect(listed.players).toMatchObject([{ nickname: "Rude", reports: 3, hidden: true }]);
  });
});

describe("the join budget", () => {
  const nicknames = (n: number) => Array.from({ length: n }, (_, i) => `Player ${String.fromCharCode(65 + i)}${String.fromCharCode(97 + i)}`);

  it("is not spent by a nickname that is invalid or already taken", async () => {
    vi.stubEnv("TRUST_PROXY", "1");
    const typist = () => browser({ address: "203.0.113.7" });
    await join(typist(), "Taken Name");
    const invalid = LIMITS.join[0].max + 3;
    for (let i = 0; i < invalid; i++) expect((await typist().send("/api/players/", { nickname: "x" })).status).toBe(400);
    for (let i = 0; i < invalid; i++) expect((await typist().send("/api/players/", { nickname: "taken  name" })).status).toBe(409);
    await join(typist(), "Free Name One");
  });

  it("allows a handful of new players per address and then asks them to wait, while another address is unaffected", async () => {
    vi.stubEnv("TRUST_PROXY", "1");
    const names = nicknames(LIMITS.join[0].max + 1);
    for (const name of names.slice(0, -1)) await join(browser({ address: "198.51.100.1" }), name);
    expect((await browser({ address: "198.51.100.1" }).send("/api/players/", { nickname: names.at(-1) })).status).toBe(429);
    await join(browser({ address: "198.51.100.2" }), names.at(-1)!);
  });

  it("does not let one visitor use up the budget for everyone when no proxy tells the address", async () => {
    const names = nicknames(LIMITS.join[0].max * 3);
    for (const name of names) await join(browser(), name);
    // A crowd is still bounded by the site-wide rule, and it resets with the window.
    const wide = LIMITS.join[1].max;
    const more = Array.from({ length: wide }, (_, i) => `Crowd ${i}`);
    let refused = 0;
    for (const name of more) if ((await browser().send("/api/players/", { nickname: name })).status === 429) refused++;
    expect(refused).toBe(names.length + more.length - wide);
    later(60 * 60 * 1000 + 1);
    await join(browser(), "After The Hour");
  });

  it("is not spent by a rename that fails, and is spent by one that works", async () => {
    const ada = browser();
    await join(ada, "Ada Lovelace");
    await join(browser(), "Grace Hopper");
    const max = LIMITS.rename[0].max;
    for (let i = 0; i < max + 2; i++) expect((await ada.request("PATCH", "/api/players/", { nickname: "grace hopper" })).status).toBe(409);
    for (let i = 0; i < max; i++) expect((await ada.request("PATCH", "/api/players/", { nickname: `Ada Number ${i}` })).status).toBe(200);
    expect((await ada.request("PATCH", "/api/players/", { nickname: "Ada Last" })).status).toBe(429);
  });
});
