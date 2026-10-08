import "@/test/dom";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_CARDS } from "@/content";
import { type RunState, useRun } from "@/learning/run";
import { prepare } from "@/learning/session";
import { MAX_OPEN_ATTEMPTS, MIN_MS_PER_CARD } from "@/server/board";
import { rightChoice } from "@/test/cards";
import { ADMIN_TOKEN, browser, later, moderator, useRoutes } from "@/test/routes";
import { Ranking } from "./Ranking";
import { Session } from "./Session";

// The session runs in a DOM, and its network calls reach the real route handlers over an in-memory database.

const SEED = 5;
const cards = ALL_CARDS.filter((c) => prepare(c, SEED).kind === "choice").slice(0, 2);

function Harness() {
  const run = useRun();
  return createElement(Session, { cards, seed: SEED, onDone: () => {}, run });
}

describe("the results screen of a scored session", () => {
  useRoutes();

  let host: HTMLElement;
  let root: Root;
  let site: ReturnType<typeof browser>;
  let started: Promise<unknown>;

  beforeEach(() => {
    site = browser();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    // The page's fetch is the in-memory browser, so the cookie it holds is the player's.
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      const reply = site.send(url, JSON.parse(String(init.body)));
      if (url === "/api/attempts/") started = reply;
      return reply;
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  const press = (key: string) => act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key })));
  const text = () => host.textContent ?? "";

  async function playThrough() {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => void (await started));
    for (const [i, card] of cards.entries()) {
      await vi.waitFor(() => expect(text()).toContain(prepare(card, SEED).prompt)); // the card is on screen
      if (i === cards.length - 1) later(MIN_MS_PER_CARD * cards.length);
      // The card listens for keys once its effect has run; pressing again after it answered does nothing.
      await vi.waitFor(async () => {
        await press(String(rightChoice(card.id, SEED)[0] + 1));
        expect(text()).toContain(card.why); // the verdict is on screen
      });
      await press("Enter");
    }
  }

  it("shows the points and the ranks the server gave", async () => {
    await site.send("/api/players/", { nickname: "Ada Lovelace" });
    await playThrough();
    await vi.waitFor(() => expect(text()).toContain("+20 points"));
    expect(text()).toContain("#1 this week");
    expect(text()).toContain("#1 all time");
    expect(host.querySelector('a[href^="/leaderboard"]')?.textContent).toBe("Leaderboard");
  });

  it("asks a player with no nickname to join", async () => {
    await playThrough();
    await vi.waitFor(() => expect(text()).toContain("Pick a nickname to count these answers on the leaderboard."));
    expect(host.querySelector('a[href^="/leaderboard"]')?.textContent).toBe("Join");
  });

  it("says a hidden entry is not scored", async () => {
    const joined = (await (await site.send("/api/players/", { nickname: "Hidden Hal" })).json()) as { player: { id: string } };
    await moderator(ADMIN_TOKEN, { id: joined.player.id, verdict: "hide" });
    await playThrough();
    await vi.waitFor(() => expect(text()).toContain("Not scored: Your entry is hidden."));
  });

  it("says why a run is not scored when the player has too many open runs", async () => {
    await site.send("/api/players/", { nickname: "Busy Bee" });
    for (let i = 0; i < MAX_OPEN_ATTEMPTS; i++) await site.send("/api/attempts/", { cardIds: cards.map((c) => c.id), seed: SEED });
    await playThrough();
    await vi.waitFor(() => expect(text()).toContain("Not scored: Too many unfinished runs."));
  });

  it("says the server could not be reached", async () => {
    await site.send("/api/players/", { nickname: "Offline Olga" });
    vi.stubGlobal("fetch", () => {
      started = Promise.resolve();
      return Promise.reject(new TypeError("fetch failed"));
    });
    await playThrough();
    await vi.waitFor(() => expect(text()).toContain("Not scored: Could not reach the server."));
  });
});

describe("the ranking panel", () => {
  const render = (state: RunState): string => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(createElement(Ranking, { state }) as ReactNode));
    const html = host.textContent ?? "";
    act(() => root.unmount());
    return html;
  };

  it("shows nothing before a run is opened and a waiting note while it is scored", () => {
    expect(render({ status: "idle" })).toBe("");
    expect(render({ status: "scoring" })).toBe("Scoring…");
  });

  it("explains that a run with no new points is capped by the day", () => {
    const standing = { nickname: "Ada", rank: 2, points: 40, hidden: false };
    const text = render({ status: "scored", award: { correct: 3, total: 3, points: 0, week: standing, all: { ...standing, rank: 5 } } });
    expect(text).toContain("No new points");
    expect(text).toContain("Each card pays once a day.");
    expect(text).toContain("#2 this week");
    expect(text).toContain("#5 all time");
  });

  it("leaves out a rank the player does not have yet", () => {
    const text = render({ status: "scored", award: { correct: 0, total: 3, points: 0, week: null, all: { nickname: "Ada", rank: null, points: 0, hidden: false } } });
    expect(text).not.toContain("this week");
    expect(text).not.toContain("all time");
  });
});
