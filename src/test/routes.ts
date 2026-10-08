import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, vi } from "vitest";
import * as admin from "@/app/api/admin/players/route";
import * as attemptByToken from "@/app/api/attempts/[token]/route";
import * as attempts from "@/app/api/attempts/route";
import * as leaderboard from "@/app/api/leaderboard/route";
import * as players from "@/app/api/players/route";
import * as reports from "@/app/api/reports/route";
import { closeDb } from "@/server/db";
import { COOKIE } from "@/server/identity";

export const ORIGIN = "http://localhost:3000";
export const ADMIN_TOKEN = "admin-token-0123456789";

let clock = Date.UTC(2026, 9, 7, 12, 0, 0);

/** Moves the server's clock, which the handlers read through `Date.now()`. */
export const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

/**
 * Gives every test an empty database file and a clock of its own. Each test starts two hours after the last,
 * so the in-memory rate-limit windows of an earlier test have passed.
 */
export function useRoutes() {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "reconcile-routes-"));
    vi.stubEnv("DB_PATH", path.join(dir, "board.db"));
    vi.stubEnv("ADMIN_TOKEN", ADMIN_TOKEN);
    vi.useFakeTimers({ toFake: ["Date"] });
    clock += 2 * 60 * 60 * 1000;
    vi.setSystemTime(clock);
  });
  afterEach(() => {
    clock = Date.now();
    closeDb();
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
}

type Handler = (request: NextRequest, context: { params: Promise<{ token: string }> }) => Promise<Response>;

/** The real route handlers, found the way Next finds them: by path and method. */
function handlerFor(method: string, pathname: string): Handler | undefined {
  const routes: Record<string, Partial<Record<string, Handler>>> = {
    "/api/players/": players,
    "/api/attempts/": attempts,
    "/api/reports/": reports,
    "/api/leaderboard/": leaderboard,
    "/api/admin/players/": admin,
  };
  const route: Partial<Record<string, Handler>> | undefined = TOKEN_PATH.test(pathname) ? attemptByToken : routes[pathname];
  return route?.[method];
}

const TOKEN_PATH = /^\/api\/attempts\/([^/]+)\/$/;

/**
 * A browser talking to the real route handlers. It keeps the player cookie, as a browser does, and sends the
 * headers a page on the same site sends. The database is whatever `DB_PATH` names.
 */
export function browser(options: { address?: string; headers?: Record<string, string> } = {}) {
  let cookie = "";

  async function request(method: string, url: string, body?: unknown): Promise<Response> {
    const target = new URL(url, ORIGIN);
    const headers = new Headers({ Origin: ORIGIN, Host: new URL(ORIGIN).host, ...options.headers });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (cookie) headers.set("Cookie", cookie);
    if (options.address) headers.set("X-Forwarded-For", options.address);
    const context = { params: Promise.resolve({ token: target.pathname.match(TOKEN_PATH)?.[1] ?? "" }) };
    const handler = handlerFor(method, target.pathname);
    if (!handler) throw new Error(`no route for ${method} ${target.pathname}`);
    const response = await handler(new NextRequest(target, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), context);
    for (const line of response.headers.getSetCookie()) {
      const [name, value] = line.split(";")[0].split("=");
      if (name === COOKIE) cookie = value ? `${name}=${value}` : "";
    }
    return response;
  }

  return {
    request,
    /** Shaped like the `send` of a run: a POST with a JSON body. */
    send: (url: string, body: unknown) => request("POST", url, body),
    get: (url: string) => request("GET", url),
    /** The cookie jar's current value, for tests that tamper with it. */
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      cookie = value;
    },
  };
}

/** A moderator's call to the admin route. */
export async function moderator(token: string, body?: unknown): Promise<Response> {
  const headers = new Headers({ Authorization: `Bearer ${token}`, Origin: ORIGIN, Host: new URL(ORIGIN).host });
  if (body === undefined) return admin.GET(new NextRequest(new URL("/api/admin/players/", ORIGIN), { headers }));
  headers.set("Content-Type", "application/json");
  return admin.POST(new NextRequest(new URL("/api/admin/players/", ORIGIN), { method: "POST", headers, body: JSON.stringify(body) }));
}
