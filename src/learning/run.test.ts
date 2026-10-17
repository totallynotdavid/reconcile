import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ids, rightChoice } from "@/test/cards";
import {
  ADMIN_TOKEN,
  browser,
  later,
  moderator,
  useRoutes,
} from "@/test/routes";
import { MIN_MS_PER_CARD } from "@/server/board";
import {
  OFFLINE,
  type RunState,
  type Send,
  UNREADABLE,
  createRun,
} from "./run";

const SEED = 7;
const cards = ids(3);
const picks = cards.map((id) => ({ id, choice: rightChoice(id, SEED) }));

function watch(send: Send) {
  const states: RunState[] = [];
  const run = createRun(send, (state) => states.push(state));
  return { run, states, last: () => states.at(-1) };
}

describe("a run against the real routes", () => {
  useRoutes();

  /** The routes, with the clock moved on once the run has been opened, as it would be while the player reads. */
  function player() {
    const site = browser();
    const send: Send = async (url, body) => {
      const res = await site.send(url, body);
      if (url === "/api/attempts/") later(MIN_MS_PER_CARD * cards.length);
      return res;
    };
    return { site, ...watch(send) };
  }

  it("opens an attempt, sends only the picks, and shows the award with the player's ranks", async () => {
    const { site, run, states } = player();
    await site.send("/api/players/", { nickname: "Ada Lovelace" });
    run.begin(cards, SEED);
    await run.submit(picks);
    expect(states.map((s) => s.status)).toEqual(["idle", "scoring", "scored"]);
    expect(states.at(-1)).toMatchObject({
      status: "scored",
      award: {
        correct: 3,
        total: 3,
        points: 30,
        week: { rank: 1, points: 30 },
        all: { rank: 1, points: 30 },
      },
    });
  });

  it("ignores a late answer to an earlier run", async () => {
    const site = browser();
    await site.send("/api/players/", { nickname: "Ada Lovelace" });
    const joined = (await (await site.get("/api/players/")).json()) as {
      player: { id: string };
    };
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const inflight: Promise<Response>[] = [];
    const send: Send = (url, body) => {
      const first = inflight.length === 0 && url === "/api/attempts/";
      const reply = first
        ? held.then(() => site.send(url, body))
        : site.send(url, body);
      inflight.push(reply);
      return reply;
    };
    const { run, states, last } = watch(send);
    run.begin(cards, SEED); // held
    run.begin(cards, SEED); // the run that counts
    await inflight[1];
    await moderator(ADMIN_TOKEN, { id: joined.player.id, verdict: "hide" });
    release();
    expect((await inflight[0]).status).toBe(403);
    await moderator(ADMIN_TOKEN, { id: joined.player.id, verdict: "unhide" });
    later(MIN_MS_PER_CARD * cards.length);
    await run.submit(picks);
    expect(states.some((s) => s.status === "failed")).toBe(false);
    expect(last()).toMatchObject({ status: "scored", award: { points: 30 } });
  });
});

describe("a server that misbehaves", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  /** A real HTTP server on a local port, and a `send` that talks to it. */
  async function serve(
    handler: (req: IncomingMessage, res: ServerResponse) => void,
  ): Promise<Send> {
    const server = createServer(handler);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    closers.push(
      () =>
        new Promise(
          (resolve) => (
            server.closeAllConnections(),
            server.close(() => resolve())
          ),
        ),
    );
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return (url, body) =>
      fetch(base + url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
  }

  const reply = (
    res: ServerResponse,
    status: number,
    body: string,
    type = "application/json",
  ) => {
    res.writeHead(status, { "Content-Type": type }).end(body);
  };

  it("says the server could not be reached when nothing is listening", async () => {
    const send = await serve(() => {});
    await closers.pop()!();
    const { run, last } = watch(send);
    run.begin(cards, SEED);
    await run.submit(picks);
    expect(last()).toEqual({ status: "failed", error: OFFLINE });
  });

  it("says the server could not be reached when the connection drops while scoring", async () => {
    const send = await serve((req, res) =>
      req.url === "/api/attempts/"
        ? reply(res, 201, '{"token":"t1"}')
        : req.socket.destroy(),
    );
    const { run, last } = watch(send);
    run.begin(cards, SEED);
    await run.submit(picks);
    expect(last()).toEqual({ status: "failed", error: OFFLINE });
  });

  it("names a reply it cannot read as that, not as a network failure", async () => {
    for (const [opening, scoring] of [
      ["<html>welcome</html>", '{"token":"t1"}'],
      ['{"nothing":true}', '{"token":"t1"}'],
      ['{"token":"t1"}', "<html>welcome</html>"],
      ['{"token":"t1"}', '{"unrelated":1}'],
    ]) {
      const send = await serve((req, res) =>
        req.url === "/api/attempts/"
          ? reply(res, 201, opening)
          : reply(res, 200, scoring),
      );
      const { run, last } = watch(send);
      run.begin(cards, SEED);
      await run.submit(picks);
      expect(last(), `${opening} then ${scoring}`).toEqual({
        status: "failed",
        error: UNREADABLE,
      });
    }
  });

  it("still names a failure whose body is not JSON", async () => {
    const send = await serve((_, res) =>
      reply(res, 502, "<html>bad gateway</html>", "text/html"),
    );
    const { run, last } = watch(send);
    run.begin(cards, SEED);
    await run.submit(picks);
    expect(last()).toEqual({ status: "failed", error: "Not scored." });
  });

  it("asks for a nickname on 401 and shows the server's words on 403 and 429", async () => {
    for (const [status, error, state] of [
      [401, "Join first.", { status: "anonymous" }],
      [
        403,
        "Your entry is hidden.",
        { status: "failed", error: "Your entry is hidden." },
      ],
      [
        429,
        "Too many unfinished runs.",
        { status: "failed", error: "Too many unfinished runs." },
      ],
    ] as const) {
      const send = await serve((_, res) =>
        reply(res, status, JSON.stringify({ error })),
      );
      const { run, last } = watch(send);
      run.begin(cards, SEED);
      await run.submit(picks);
      expect(last(), String(status)).toEqual(state);
    }
  });
});
