import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { type Fail, type Player, getPlayer } from "./board";
import { getDb } from "./db";
import { COOKIE, COOKIE_MAX_AGE, sessionSecret, sign, verify } from "./identity";
import { createLimiter } from "./limit";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Rule = { by: "ip" | "player" | "site"; max: number; ms: number };

/**
 * Per-action budgets. An action is refused when any of its rules is used up. `ip` rules apply only when the
 * address is known (see `clientAddress`); the `site` rule counts everyone together and holds without a proxy.
 */
export const LIMITS = {
  join: [
    { by: "ip", max: 5, ms: HOUR },
    { by: "site", max: 100, ms: HOUR },
  ],
  rename: [{ by: "player", max: 5, ms: DAY }],
  start: [{ by: "player", max: 120, ms: HOUR }],
  submit: [{ by: "player", max: 120, ms: HOUR }],
  report: [{ by: "player", max: 20, ms: DAY }],
  admin: [
    { by: "ip", max: 30, ms: 60_000 },
    { by: "site", max: 300, ms: 60_000 },
  ],
} as const satisfies Record<string, readonly Rule[]>;

const limiter = createLimiter();

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export const failure = (f: Fail) => json({ error: f.error }, f.status);

/**
 * Behind a reverse proxy the client address is in X-Forwarded-For. Without one the header is
 * client-controlled, so it is only read when the operator says a proxy sets it. Null means unknown.
 */
function clientAddress(request: NextRequest): string | null {
  if (process.env.TRUST_PROXY !== "1") return null;
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

/**
 * Checks the action's budget and returns the function that spends one unit of it, or null when the budget
 * is used up. Spending is separate so an action that fails for a reason of the caller's own (a taken
 * nickname) does not cost them anything.
 */
export function reserve(request: NextRequest, action: keyof typeof LIMITS, playerId?: string): (() => void) | null {
  const now = Date.now();
  const rules: readonly Rule[] = LIMITS[action];
  const counters = rules.flatMap((rule) => {
    const who = rule.by === "site" ? "*" : rule.by === "ip" ? clientAddress(request) : playerId;
    return who ? [{ key: `${action}:${rule.by}:${who}`, rule }] : [];
  });
  if (!counters.every(({ key, rule }) => limiter.room(key, rule.max, now))) return null;
  return () => counters.forEach(({ key, rule }) => limiter.hit(key, rule.ms, now));
}

/** Checks the budget and spends one unit at once. */
export function allowed(request: NextRequest, action: keyof typeof LIMITS, playerId?: string): boolean {
  const spend = reserve(request, action, playerId);
  spend?.();
  return spend !== null;
}

export const tooMany = () => json({ error: "Too many requests. Try again later." }, 429);

/**
 * A page on another site can make the browser send our cookie, but it cannot read the reply and cannot
 * send an Origin that matches ours. State changes therefore need a matching Origin and a JSON body.
 */
export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = (process.env.TRUST_PROXY === "1" && request.headers.get("x-forwarded-host")) || request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Parses a JSON object body from a same-origin request. Null means the request must be refused. */
export async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  if (!sameOrigin(request)) return null;
  if (!request.headers.get("content-type")?.startsWith("application/json")) return null;
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export const badRequest = () => json({ error: "Bad request." }, 400);

/** The player behind the cookie, or null when there is none, it was tampered with, or the player was removed. */
export function currentPlayer(request: NextRequest): Player | null {
  const id = verify(request.cookies.get(COOKIE)?.value, sessionSecret());
  return id ? getPlayer(getDb(), id) : null;
}

export function setPlayerCookie(response: NextResponse, playerId: string): NextResponse {
  response.cookies.set(COOKIE, sign(playerId, sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}

export function clearPlayerCookie(response: NextResponse): NextResponse {
  response.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

/** Moderator access: `Authorization: Bearer $ADMIN_TOKEN`. With no token configured nobody is a moderator. */
export function isModerator(request: NextRequest): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token || token.length < 16) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
