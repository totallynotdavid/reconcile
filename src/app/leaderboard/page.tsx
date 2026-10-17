import { cookies } from "next/headers";
import { standings } from "@/server/board";
import { getDb } from "@/server/db";
import { COOKIE, sessionSecret, verify } from "@/server/identity";
import { Board } from "./Board";

export const metadata = { title: "Leaderboard · Reconcile" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const period = (await searchParams).period === "week" ? "week" : "all";
  const playerId = verify(
    (await cookies()).get(COOKIE)?.value,
    sessionSecret(),
  );
  // oxlint-disable-next-line react/purity -- a server component renders once per request, and the board must use that request's time
  const now = Date.now();
  return <Board board={standings(getDb(), period, playerId, now)} />;
}
