"use client";
import { useEffect, useMemo, useState } from "react";
import type { Source } from "@/content/types";
import type { Answer } from "@/learning/progress";
import { type Prepared, prepare } from "@/learning/session";
import { PASS_RATIO } from "@/learning/leitner";

type Props = {
  cards: Parameters<typeof prepare>[0][];
  seed: number;
  /** Shown on the result screen. When set, a score under the pass ratio counts as a fail. */
  gated?: boolean;
  onDone: (answers: Answer[]) => void;
  /** Rendered under the score when the session ends. */
  footer?: (passed: boolean, retry: () => void) => React.ReactNode;
};

export function Session({ cards, seed, gated = true, onDone, footer }: Props) {
  const [round, setRound] = useState(0);
  const prepared = useMemo(() => cards.map((c) => prepare(c, seed + round)), [cards, seed, round]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(Answer & { id: string })[]>([]);
  const [done, setDone] = useState(false);

  const current = prepared[index];

  function record(correct: boolean) {
    setAnswers((a) => [...a, { id: current.card.id, concept: current.card.concept, correct }]);
  }

  function next() {
    if (index + 1 < prepared.length) return setIndex(index + 1);
    setDone(true);
    onDone(answers.map(({ concept, correct }) => ({ concept, correct })));
  }

  function retry() {
    setRound((r) => r + 1);
    setIndex(0);
    setAnswers([]);
    setDone(false);
  }

  if (done) {
    const correct = answers.filter((a) => a.correct).length;
    const ok = correct / answers.length >= PASS_RATIO;
    const missed = prepared.filter((p) => answers.some((a) => a.id === p.card.id && !a.correct));
    return (
      <div>
        <h2 className="text-xl font-bold">
          {correct} of {answers.length}
          {gated && <span className={ok ? " text-[var(--good)]" : " text-[var(--bad)]"}> — {ok ? "passed" : "not yet"}</span>}
        </h2>
        {gated && !ok && <p className="mt-1 text-sm">You need {Math.round(PASS_RATIO * 100)}%. Retry brings new numbers on the predict cards.</p>}
        {missed.length > 0 && (
          <div className="mt-4 space-y-3">
            <h3 className="font-semibold">Missed</h3>
            {missed.map((p) => (
              <div key={p.card.id} className="rounded-lg border border-[var(--line)] bg-white p-3 text-sm">
                <p className="font-medium">{p.kind === "triage" ? p.prompt : p.prompt}</p>
                <p className="mt-1 opacity-80">{p.card.why}</p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-5">{footer?.(ok, retry)}</div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs uppercase tracking-wide opacity-60">
        {index + 1} / {prepared.length}
      </p>
      <Card key={`${round}-${index}`} item={current} onGraded={record} onNext={next} last={index + 1 === prepared.length} />
    </div>
  );
}

function SourceTag({ source }: { source?: Source }) {
  if (!source) return null;
  return (
    <p className="mt-2 text-xs opacity-70">
      <span className={source.verified ? "text-[var(--good)]" : "text-[var(--bad)]"}>{source.verified ? "docs-verified" : "unverified"}</span>
      {" · "}
      Odoo {source.version} · {source.ref}
    </p>
  );
}

function Feedback({ item, correct, onNext, last }: { item: Prepared; correct: boolean; onNext: () => void; last: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Enter" && onNext();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext]);
  return (
    <div className="mt-4 rounded-lg border border-[var(--line)] bg-white p-4 text-sm">
      <p className={correct ? "font-semibold text-[var(--good)]" : "font-semibold text-[var(--bad)]"}>{correct ? "Right" : "Not quite"}</p>
      <p className="mt-1">{item.card.why}</p>
      {item.kind === "choice" && item.trace && (
        <pre className="mono mt-3 overflow-x-auto rounded bg-[var(--odoo-soft)] p-3 text-xs">{item.trace.join("\n")}</pre>
      )}
      <SourceTag source={item.card.source} />
      <button className="btn btn-primary mt-4 w-full" onClick={onNext}>
        {last ? "Finish" : "Next"} <span className="opacity-60">(Enter)</span>
      </button>
    </div>
  );
}

function Card({ item, onGraded, onNext, last }: { item: Prepared; onGraded: (ok: boolean) => void; onNext: () => void; last: boolean }) {
  if (item.kind === "choice") return <ChoiceView item={item} onGraded={onGraded} onNext={onNext} last={last} />;
  if (item.kind === "bug") return <BugView item={item} onGraded={onGraded} onNext={onNext} last={last} />;
  return <TriageView item={item} onGraded={onGraded} onNext={onNext} last={last} />;
}

type ViewProps<K extends Prepared["kind"]> = {
  item: Extract<Prepared, { kind: K }>;
  onGraded: (ok: boolean) => void;
  onNext: () => void;
  last: boolean;
};

function ChoiceView({ item, onGraded, onNext, last }: ViewProps<"choice">) {
  const [picked, setPicked] = useState<number | null>(null);
  const isPredict = item.card.kind === "predict";

  function pick(i: number) {
    if (picked !== null) return;
    setPicked(i);
    onGraded(i === item.answer);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= item.options.length) pick(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div>
      {isPredict && <p className="mb-1 text-xs font-semibold uppercase text-[var(--odoo)]">Predict first, then see the ledger</p>}
      <p className="text-lg font-medium">{item.prompt}</p>
      <div className="mt-4 grid gap-2">
        {item.options.map((o, i) => {
          const cls = picked === null ? "" : i === item.answer ? "good" : i === picked ? "bad" : "";
          return (
            <button key={i} disabled={picked !== null} onClick={() => pick(i)} className={`btn ${cls}`}>
              <span className="mr-2 opacity-50">{i + 1}</span>
              {o}
            </button>
          );
        })}
      </div>
      {picked !== null && <Feedback item={item} correct={picked === item.answer} onNext={onNext} last={last} />}
    </div>
  );
}

function BugView({ item, onGraded, onNext, last }: ViewProps<"bug">) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase text-[var(--odoo)]">Spot the bug · {item.language}</p>
      <p className="text-lg font-medium">{item.prompt}</p>
      <div className="mono mt-4 overflow-x-auto rounded-lg border border-[var(--line)] bg-white text-xs">
        {item.lines.map((line, i) => {
          const cls = picked === null ? "" : i === item.answer ? "good" : i === picked ? "bad" : "";
          return (
            <button
              key={i}
              disabled={picked !== null}
              onClick={() => {
                setPicked(i);
                onGraded(i === item.answer);
              }}
              className={`flex w-full gap-3 border-b border-[var(--line)] px-3 py-1.5 text-left last:border-b-0 hover:bg-[var(--odoo-soft)] ${cls}`}
            >
              <span className="w-4 shrink-0 opacity-40">{i + 1}</span>
              <span className="whitespace-pre">{line}</span>
            </button>
          );
        })}
      </div>
      {picked !== null && <Feedback item={item} correct={picked === item.answer} onNext={onNext} last={last} />}
    </div>
  );
}

function TriageView({ item, onGraded, onNext, last }: ViewProps<"triage">) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [slips, setSlips] = useState(0);
  const [finished, setFinished] = useState(false);
  const s = item.steps[step];

  function pick(i: number) {
    if (picked !== null) return;
    setPicked(i);
    if (i !== s.answer) setSlips((n) => n + 1);
  }

  function advance() {
    if (step + 1 < item.steps.length) {
      setStep(step + 1);
      return setPicked(null);
    }
    setFinished(true);
    onGraded(slips === 0);
  }

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase text-[var(--odoo)]">Triage · step {step + 1} of {item.steps.length}</p>
      <p className="text-sm opacity-70">{item.prompt}</p>
      <p className="mt-2 text-lg font-medium">{s.clue}</p>
      <div className="mt-4 grid gap-2">
        {s.options.map((o, i) => {
          const cls = picked === null ? "" : i === s.answer ? "good" : i === picked ? "bad" : "";
          return (
            <button key={i} disabled={picked !== null} onClick={() => pick(i)} className={`btn ${cls}`}>
              {o}
            </button>
          );
        })}
      </div>
      {picked !== null && !finished && (
        <div className="mt-4 rounded-lg border border-[var(--line)] bg-white p-4 text-sm">
          <p>{s.why}</p>
          <button className="btn btn-primary mt-3 w-full" onClick={advance}>
            Continue
          </button>
        </div>
      )}
      {finished && <Feedback item={item} correct={slips === 0} onNext={onNext} last={last} />}
    </div>
  );
}
