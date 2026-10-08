import type { NextRequest } from "next/server";
import { report } from "@/server/board";
import { getDb } from "@/server/db";
import { allowed, badRequest, currentPlayer, failure, json, readBody, tooMany } from "@/server/http";

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return badRequest();
  const player = currentPlayer(request);
  if (!player) return json({ error: "Join first." }, 401);
  if (!allowed(request, "report", player.id)) return tooMany();
  const result = report(getDb(), player.id, body.playerId, body.reason, Date.now());
  return result.ok ? json({ hidden: result.hidden }) : failure(result);
}
