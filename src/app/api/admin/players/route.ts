import type { NextRequest } from "next/server";
import { flagged, moderate } from "@/server/board";
import { getDb } from "@/server/db";
import { allowed, failure, isModerator, json, tooMany } from "@/server/http";

/** Only failed attempts spend the budget, so guessing the token is slow and a moderator is never locked out. */
function refuse(request: NextRequest) {
  if (isModerator(request)) return null;
  return allowed(request, "admin") ? json({ error: "Not allowed." }, 401) : tooMany();
}

/** Reported and hidden players. Needs `Authorization: Bearer $ADMIN_TOKEN`. */
export async function GET(request: NextRequest) {
  return refuse(request) ?? json({ players: flagged(getDb()) });
}

/** Body `{ "id": "...", "verdict": "hide" | "unhide" | "delete" }`. */
export async function POST(request: NextRequest) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = (await request.json().catch(() => null)) as { id?: unknown; verdict?: unknown } | null;
  const result = moderate(getDb(), body?.id, body?.verdict);
  return result.ok ? json({ done: result.done }) : failure(result);
}
