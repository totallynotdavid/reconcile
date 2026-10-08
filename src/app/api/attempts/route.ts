import type { NextRequest } from "next/server";
import { startAttempt } from "@/server/board";
import { getDb } from "@/server/db";
import { allowed, badRequest, currentPlayer, failure, json, readBody, tooMany } from "@/server/http";

/** Opens a timed run over the listed cards, drawn with `seed`. Answers go to `/api/attempts/[token]` when the run ends. */
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return badRequest();
  const player = currentPlayer(request);
  if (!player) return json({ error: "Join first." }, 401);
  if (!allowed(request, "start", player.id)) return tooMany();
  const result = startAttempt(getDb(), player.id, body.cardIds, body.seed, Date.now());
  return result.ok ? json({ token: result.token }, 201) : failure(result);
}
