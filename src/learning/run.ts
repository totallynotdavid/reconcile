"use client";
import { useMemo, useState } from "react";
import type { Choice } from "./judge";

export type Standing = { nickname: string; rank: number | null; points: number; hidden: boolean };
export type Award = { correct: number; total: number; points: number; week: Standing | null; all: Standing | null };

export type RunState =
  | { status: "idle" }
  /** No nickname yet, so nothing is scored. */
  | { status: "anonymous" }
  | { status: "scoring" }
  | { status: "scored"; award: Award }
  /** The run is not counted. `error` says why in words a player can act on. */
  | { status: "failed"; error: string };

export type Send = (url: string, body: unknown) => Promise<Response>;

export const OFFLINE = "Could not reach the server.";
export const UNREADABLE = "The server sent a reply that could not be read.";

const post: Send = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** The JSON body of a reply, or null when there is none or it is not JSON. A bad body is not a network failure. */
const bodyOf = async (res: Response): Promise<Record<string, unknown> | null> => {
  const body: unknown = await res.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
};

const errorOf = async (res: Response) => {
  const error = (await bodyOf(res))?.error;
  return typeof error === "string" ? error : "Not scored.";
};

const isAward = (body: Record<string, unknown> | null): body is Award =>
  typeof body?.correct === "number" && typeof body.total === "number" && typeof body.points === "number";

/**
 * One scored run at a time. `begin` tells the server which cards are about to be played and with which
 * seed, which starts its clock. `submit` sends only the picks. The server decides what was right and what
 * it is worth. Play never depends on it: whatever goes wrong, the session runs and the state says why the
 * points are skipped.
 */
export function createRun(send: Send, set: (state: RunState) => void) {
  let generation = 0;
  let token: Promise<string | null> = Promise.resolve(null);

  const reporter = () => {
    const mine = generation;
    return (state: RunState) => mine === generation && set(state);
  };

  async function open(cardIds: string[], seed: number, report: (state: RunState) => void) {
    const fail = (error: string) => {
      report({ status: "failed", error });
      return null;
    };
    let res: Response;
    try {
      res = await send("/api/attempts/", { cardIds, seed });
    } catch {
      return fail(OFFLINE);
    }
    if (res.status === 401) {
      report({ status: "anonymous" });
      return null;
    }
    if (!res.ok) return fail(await errorOf(res));
    const opened = (await bodyOf(res))?.token;
    return typeof opened === "string" ? opened : fail(UNREADABLE);
  }

  const begin = (cardIds: string[], seed: number) => {
    ++generation;
    const report = reporter();
    report({ status: "idle" });
    token = open(cardIds, seed, report);
  };

  const submit = async (picks: { id: string; choice: Choice }[]) => {
    const report = reporter();
    const opened = await token;
    if (!opened) return;
    report({ status: "scoring" });
    let res: Response;
    try {
      res = await send(`/api/attempts/${opened}/`, { picks });
    } catch {
      return report({ status: "failed", error: OFFLINE });
    }
    if (!res.ok) return report({ status: "failed", error: await errorOf(res) });
    const award = await bodyOf(res);
    report(isAward(award) ? { status: "scored", award } : { status: "failed", error: UNREADABLE });
  };

  return { begin, submit };
}

export function useRun() {
  const [state, setState] = useState<RunState>({ status: "idle" });
  const run = useMemo(() => createRun(post, setState), []);
  return useMemo(() => ({ state, begin: run.begin, submit: run.submit }), [state, run]);
}

export type Run = ReturnType<typeof useRun>;
