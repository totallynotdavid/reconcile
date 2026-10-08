"use client";
import { Flag, Medal, Trophy } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NICK_MAX } from "@/server/nickname";
import type { Standings } from "@/server/board";

async function send(method: string, url: string, body: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return null;
  return ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Something went wrong.";
}

export function Board({ board }: { board: Standings }) {
  const { period, entries, me } = board;
  const tab = (active: boolean) => `rounded-xl px-4 py-2 text-sm font-bold ${active ? "bg-[var(--odoo)] text-white" : "hover:bg-[var(--odoo-soft)]"}`;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="eyebrow">Leaderboard</p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight">Who knows their ledger</h1>
        <p className="mt-2 text-[var(--muted)]">
          10 points for every card you get right. A card pays once a day, so repeating a level will not climb the board. The server checks every answer.
        </p>
      </div>

      {me ? <You me={me} /> : <Join />}

      <nav className="flex gap-2" aria-label="Period">
        <Link href="/leaderboard/" className={tab(period === "all")} aria-current={period === "all" ? "page" : undefined}>
          All time
        </Link>
        <Link href="/leaderboard/?period=week" className={tab(period === "week")} aria-current={period === "week" ? "page" : undefined}>
          This week
        </Link>
      </nav>
      {period === "week" && <p className="-mt-3 text-xs text-[var(--muted)]">The week starts over every Monday at 00:00 UTC.</p>}

      {entries.length === 0 ? (
        <p className="panel p-6 text-center text-sm text-[var(--muted)]">No one has scored {period === "week" ? "this week" : "yet"}. Play a level to be first.</p>
      ) : (
        <ol className="panel divide-y divide-[var(--line)] overflow-hidden" aria-label={period === "week" ? "Weekly standings" : "All-time standings"}>
          {entries.map((e) => (
            <li key={e.id} className={`flex items-center gap-3 px-4 py-3 ${e.you ? "bg-[var(--odoo-soft)]" : ""}`} aria-current={e.you ? "true" : undefined}>
              <span className="grid size-8 shrink-0 place-items-center text-sm font-extrabold">
                {e.rank <= 3 ? <Medal size={26} weight="fill" color={["#d9a521", "#9aa3ad", "#b8733b"][e.rank - 1]} aria-label={`Place ${e.rank}`} /> : e.rank}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">
                {e.nickname}
                {e.you && <span className="ml-2 text-xs font-bold text-[var(--odoo)]">you</span>}
              </span>
              <span className="mono text-sm font-bold">{e.points}</span>
              {me && !e.you && <ReportButton id={e.id} nickname={e.nickname} />}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function You({ me }: { me: NonNullable<Standings["me"]> }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.nickname);
  const [error, setError] = useState<string | null>(null);

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    const failed = await send("PATCH", "/api/players/", { nickname: name });
    setError(failed);
    if (!failed) {
      setEditing(false);
      router.refresh();
    }
  }

  async function leave() {
    if (!confirm("Remove your nickname and all your points from the leaderboard?")) return;
    const failed = await send("DELETE", "/api/players/", {});
    setError(failed);
    if (!failed) router.refresh();
  }

  return (
    <section className="panel space-y-3 p-5" aria-label="Your place">
      <div className="flex items-center gap-3">
        <Trophy size={28} weight="fill" className="text-[var(--amber-deep)]" />
        <div className="flex-1">
          <p className="font-extrabold">{me.nickname}</p>
          <p className="text-sm text-[var(--muted)]" data-testid="own-rank">
            {me.hidden ? "Your entry is hidden while it is reviewed." : me.rank ? `Rank #${me.rank} with ${me.points} points` : "No points here yet. Play a level."}
          </p>
        </div>
        <button className="btn px-3 py-1.5 text-sm" onClick={() => setEditing(!editing)}>
          Rename
        </button>
        <button className="btn px-3 py-1.5 text-sm" onClick={leave}>
          Leave
        </button>
      </div>
      {editing && (
        <form onSubmit={rename} className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={NICK_MAX} aria-label="New nickname" className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-white px-3 py-2" />
          <button className="btn btn-plum px-4">Save</button>
        </form>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-[var(--bad)]">{error}</p>}
    </section>
  );
}

function Join() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const failed = await send("POST", "/api/players/", { nickname: name });
    setError(failed);
    if (!failed) router.refresh();
  }

  return (
    <form onSubmit={join} className="panel space-y-3 p-5" aria-label="Join the leaderboard">
      <label htmlFor="nickname" className="font-extrabold">
        Pick a nickname to join
      </label>
      <p className="text-sm text-[var(--muted)]">No email, no password. This browser remembers you with a cookie, so a new browser is a new player. Your study progress stays on this device either way.</p>
      <div className="flex gap-2">
        <input id="nickname" value={name} onChange={(e) => setName(e.target.value)} maxLength={NICK_MAX} autoComplete="off" placeholder="Ada Lovelace" className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-white px-3 py-2" />
        <button className="btn btn-primary px-5">Join</button>
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-[var(--bad)]">{error}</p>}
    </form>
  );
}

function ReportButton({ id, nickname }: { id: string; nickname: string }) {
  const [state, setState] = useState<"idle" | "sent" | string>("idle");
  async function report() {
    const failed = await send("POST", "/api/reports/", { playerId: id });
    setState(failed ?? "sent");
  }
  if (state === "sent") return <span className="text-xs text-[var(--muted)]">Reported</span>;
  if (state !== "idle") return <span role="alert" className="text-xs text-[var(--bad)]">{state}</span>;
  return (
    <button onClick={report} aria-label={`Report ${nickname}`} className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--bad-soft)] hover:text-[var(--bad)]">
      <Flag size={16} />
    </button>
  );
}
