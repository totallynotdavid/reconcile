import type { NextRequest } from "next/server";
import { createPlayer, deletePlayer, renamePlayer } from "@/server/board";
import { getDb } from "@/server/db";
import { badRequest, clearPlayerCookie, currentPlayer, failure, json, readBody, reserve, setPlayerCookie, tooMany } from "@/server/http";

/** Who the cookie says you are, or null. */
export async function GET(request: NextRequest) {
  return json({ player: currentPlayer(request) });
}

/** Join: claims a nickname and sets the cookie that proves it. Renaming is a PATCH. */
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return badRequest();
  if (currentPlayer(request)) return json({ error: "You already have a nickname." }, 409);
  const spend = reserve(request, "join");
  if (!spend) return tooMany();
  const result = createPlayer(getDb(), body.nickname, Date.now());
  if (!result.ok) return failure(result);
  spend();
  return setPlayerCookie(json({ player: result.player }, 201), result.player.id);
}

export async function PATCH(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return badRequest();
  const player = currentPlayer(request);
  if (!player) return json({ error: "Join first." }, 401);
  const spend = reserve(request, "rename", player.id);
  if (!spend) return tooMany();
  const result = renamePlayer(getDb(), player.id, body.nickname);
  if (!result.ok) return failure(result);
  spend();
  return json({ player: result.player });
}

/** Leave: removes the nickname and every point, attempt and report tied to it. */
export async function DELETE(request: NextRequest) {
  if (!(await readBody(request))) return badRequest();
  const player = currentPlayer(request);
  if (player) deletePlayer(getDb(), player.id);
  return clearPlayerCookie(json({ ok: true }));
}
