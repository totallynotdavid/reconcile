import type { NextRequest } from "next/server";
import { standings } from "@/server/board";
import { getDb } from "@/server/db";
import { currentPlayer, json } from "@/server/http";

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") === "week" ? "week" : "all";
  return json(standings(getDb(), period, currentPlayer(request)?.id ?? null, Date.now()));
}
