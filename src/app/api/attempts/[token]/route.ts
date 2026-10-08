import type { NextRequest } from "next/server";
import { standings, submitAttempt } from "@/server/board";
import { getDb } from "@/server/db";
import { allowed, badRequest, currentPlayer, failure, json, readBody, tooMany } from "@/server/http";

/** Scores a finished run from its picks. The body carries the picks, never a score or a seed. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const body = await readBody(request);
  if (!body) return badRequest();
  const player = currentPlayer(request);
  if (!player) return json({ error: "Join first." }, 401);
  if (!allowed(request, "submit", player.id)) return tooMany();
  const { token } = await params;
  const db = getDb();
  const now = Date.now();
  const result = submitAttempt(db, player.id, token, body, now);
  if (!result.ok) return failure(result);
  const { ok: _, ...award } = result;
  return json({ ...award, week: standings(db, "week", player.id, now).me, all: standings(db, "all", player.id, now).me });
}
