"use client";
import { ArrowRight, CheckCircle, Fire, Star, XCircle } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { Source } from "@/content/types";
import type { Choice } from "@/learning/judge";
import { PASS_RATIO } from "@/learning/leitner";
import { type Answer, stars as starsOf } from "@/learning/progress";
import type { Run, RunState } from "@/learning/run";
import { type Prepared, prepare } from "@/learning/session";
import { LedgerStage } from "./LedgerStage";
import { Ranking } from "./Ranking";

type Props = {
  cards: Parameters<typeof prepare>[0][];
  seed: number;
  /** When set, a score under the pass ratio counts as a fail. */
  gated?: boolean;
  onDone: (answers: Answer[]) => void;
  /** Scores each round on the server for the leaderboard. Without it the session is local only. */
  run?: Run;
  /** Rendered under the score when the session ends. */
  footer?: (passed: boolean, retry: () => void) => React.ReactNode;
};

type Result = Answer & { id: string; choice: Choice };

export function Session({ cards, seed, gated = true, onDone, run, footer }: Props) {
  const [round, setRound] = useState(0);
  const drawn = seed + round;
  const prepared = useMemo(() => cards.map((c) => prepare(c, drawn)), [cards, drawn]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Result[]>([]);
  const [done, setDone] = useState(false);
  const current = prepared[index];

  const begin = run?.begin;
  useEffect(() => {
    begin?.(prepared.map((p) => p.card.id), drawn);
  }, [begin, prepared, drawn]);

  function record(correct: boolean, choice: Choice) {
    setAnswers((a) => [...a, { id: current.card.id, concept: current.card.concept, correct, choice }]);
  }

  function next() {
    if (index + 1 < prepared.length) return setIndex(index + 1);
    setDone(true);
    onDone(answers.map(({ concept, correct }) => ({ concept, correct })));
    void run?.submit(answers.map(({ id, choice }) => ({ id, choice })));
  }

  function retry() {
    setRound((r) => r + 1);
    setIndex(0);
    setAnswers([]);
    setDone(false);
  }

  if (done) return <Results prepared={prepared} answers={answers} gated={gated} run={run?.state} footer={footer?.(passedOf(answers), retry)} />;

  let streak = 0;
  for (let i = answers.length - 1; i >= 0 && answers[i].correct; i--) streak++;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={prepared.length} aria-valuenow={answers.length}>
          {prepared.map((p, i) => {
            const r = answers.find((a) => a.id === p.card.id);
            const tone = r ? (r.correct ? "bg-[var(--good)]" : "bg-[var(--bad)]") : i === index ? "bg-[var(--amber)]" : "bg-[var(--line)]";
            return <span key={p.card.id} className={`h-2.5 flex-1 rounded-full transition-colors ${tone}`} />;
          })}
        </div>
        <span className={`flex items-center gap-1 text-sm font-bold ${streak >= 2 ? "text-[var(--amber-deep)]" : "text-[var(--muted)]"}`}>
          <Fire size={20} weight="fill" />
          {streak}
        </span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={`${round}-${index}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
          <Card item={current} onGraded={record} onNext={next} last={index + 1 === prepared.length} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const passedOf = (answers: Result[]) => answers.length > 0 && answers.filter((a) => a.correct).length / answers.length >= PASS_RATIO;

function Results({ prepared, answers, gated, run, footer }: { prepared: Prepared[]; answers: Result[]; gated: boolean; run?: RunState; footer: React.ReactNode }) {
  const correct = answers.filter((a) => a.correct).length;
  const ratio = correct / answers.length;
  const ok = ratio >= PASS_RATIO;
  const missed = prepared.filter((p) => answers.some((a) => a.id === p.card.id && !a.correct));
  const stars = starsOf({ best: correct, total: answers.length, passed: ok, attempts: 1 });
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  return (
    <div className="space-y-5">
      <div className="panel flex flex-col items-center gap-3 p-8 text-center">
        <div className="relative size-36">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90">
            <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--line)" strokeWidth="10" />
            <motion.circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={ok || !gated ? "var(--good)" : "var(--amber)"}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circ}
              initial={{ strokeDashoffset: circ }}
              animate={{ strokeDashoffset: circ * (1 - ratio) }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-3xl font-extrabold">
            {correct}/{answers.length}
          </span>
        </div>
        {gated && (
          <div className="flex gap-1.5">
            {[1, 2, 3].map((n) => (
              <motion.span key={n} initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.5 + n * 0.15, type: "spring", stiffness: 300 }}>
                <Star size={34} weight="fill" color={n <= stars ? "var(--amber)" : "var(--line)"} />
              </motion.span>
            ))}
          </div>
        )}
        <h2 className="text-2xl font-extrabold">{!gated ? "Done" : ok ? "Level passed" : "Not yet"}</h2>
        {gated && !ok && <p className="max-w-sm text-sm text-[var(--muted)]">You need {Math.round(PASS_RATIO * 100)}%. A retry brings new numbers on the predict cards.</p>}
      </div>
      {run && <Ranking state={run} />}
      {missed.length > 0 && (
        <div className="space-y-3">
          <h3 className="eyebrow">Missed</h3>
          {missed.map((p) => (
            <div key={p.card.id} className="panel p-4 text-sm">
              <p className="font-semibold">{p.prompt}</p>
              <p className="mt-1.5 text-[var(--muted)]">{p.card.why}</p>
            </div>
          ))}
        </div>
      )}
      <div>{footer}</div>
    </div>
  );
}

function SourceTag({ source }: { source?: Source }) {
  if (!source) return null;
  return (
    <p className="mt-2 text-xs text-[var(--muted)]">
      Odoo {source.version} · {source.ref}
    </p>
  );
}

/** Bottom sheet: the verdict, the reason, the way on. */
function Feedback({ item, correct, onNext, last }: { item: Prepared; correct: boolean; onNext: () => void; last: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Enter" && onNext();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext]);
  const tone = correct ? "border-[var(--good)] bg-[var(--good-soft)]" : "border-[var(--bad)] bg-[var(--bad-soft)]";
  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={`fixed inset-x-0 bottom-0 z-30 border-t-2 ${tone}`}
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
        <div className="flex-1 text-sm">
          <p className={`flex items-center gap-2 text-base font-extrabold ${correct ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>
            {correct ? <CheckCircle size={24} weight="fill" /> : <XCircle size={24} weight="fill" />}
            {correct ? "Right" : "Not quite"}
          </p>
          <p className="mt-1">{item.card.why}</p>
          <SourceTag source={item.card.source} />
        </div>
        <button className="btn btn-primary flex shrink-0 items-center justify-center gap-2 px-6" onClick={onNext}>
          {last ? "Finish" : "Next"} <ArrowRight size={18} weight="bold" /> <span className="keycap">Enter</span>
        </button>
      </div>
    </motion.div>
  );
}

function Card({ item, onGraded, onNext, last }: { item: Prepared; onGraded: (ok: boolean, choice: Choice) => void; onNext: () => void; last: boolean }) {
  if (item.kind === "choice") return <ChoiceView item={item} onGraded={onGraded} onNext={onNext} last={last} />;
  if (item.kind === "bug") return <BugView item={item} onGraded={onGraded} onNext={onNext} last={last} />;
  return <TriageView item={item} onGraded={onGraded} onNext={onNext} last={last} />;
}

type ViewProps<K extends Prepared["kind"]> = {
  item: Extract<Prepared, { kind: K }>;
  onGraded: (ok: boolean, choice: Choice) => void;
  onNext: () => void;
  last: boolean;
};

const shake = { x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.35 } };

function Prompt({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      {label && <p className="eyebrow">{label}</p>}
      <p className={`${label ? "mt-1.5 " : ""}text-xl font-bold leading-snug sm:text-2xl`}>{children}</p>
    </div>
  );
}

function ChoiceView({ item, onGraded, onNext, last }: ViewProps<"choice">) {
  const [picked, setPicked] = useState<number | null>(null);
  const isPredict = item.card.kind === "predict";

  function pick(i: number) {
    if (picked !== null) return;
    setPicked(i);
    onGraded(i === item.answer, [i]);
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
      <Prompt label={isPredict ? undefined : "Choose"}>{item.prompt}</Prompt>
      {item.scene && (
        <div className="mb-4">
          <LedgerStage scene={item.scene} reveal={picked !== null} />
        </div>
      )}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {item.options.map((o, i) => {
          const state = picked === null ? "" : i === item.answer ? "good" : i === picked ? "bad" : "dim";
          return (
            <motion.button key={o} disabled={picked !== null} onClick={() => pick(i)} className={`btn flex items-start gap-3 ${state}`} animate={state === "bad" ? shake : undefined}>
              <span className="keycap mt-0.5 shrink-0">{i + 1}</span>
              <span>{o}</span>
            </motion.button>
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
      <Prompt label={`Spot the bug · ${item.language}`}>{item.prompt}</Prompt>
      <div className="mono panel overflow-hidden text-[13px]">
        {item.lines.map((line, i) => {
          const state = picked === null ? "" : i === item.answer ? "bg-[var(--good-soft)]" : i === picked ? "bg-[var(--bad-soft)]" : "opacity-50";
          return (
            <button
              key={i}
              disabled={picked !== null}
              onClick={() => {
                setPicked(i);
                onGraded(i === item.answer, [i]);
              }}
              className={`flex w-full cursor-pointer gap-3 border-b border-[var(--line)] px-4 py-2.5 text-left last:border-b-0 enabled:hover:bg-[var(--odoo-soft)] ${state}`}
            >
              <span className="w-4 shrink-0 text-[var(--muted)]">{i + 1}</span>
              <span className="whitespace-pre-wrap break-words">{line}</span>
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
  const [choice, setChoice] = useState<Choice>([]);
  const [finished, setFinished] = useState(false);
  const s = item.steps[step];

  function pick(i: number) {
    if (picked !== null) return;
    setPicked(i);
    setChoice((c) => [...c, i]);
    if (i !== s.answer) setSlips((n) => n + 1);
  }

  function advance() {
    if (step + 1 < item.steps.length) {
      setStep(step + 1);
      return setPicked(null);
    }
    setFinished(true);
    onGraded(slips === 0, choice);
  }

  return (
    <div>
      <p className="mb-3 text-sm text-[var(--muted)]">{item.prompt}</p>
      <Prompt label={`Triage · step ${step + 1} of ${item.steps.length}`}>{s.clue}</Prompt>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {s.options.map((o, i) => {
          const state = picked === null ? "" : i === s.answer ? "good" : i === picked ? "bad" : "dim";
          return (
            <motion.button key={o} disabled={picked !== null} onClick={() => pick(i)} className={`btn ${state}`} animate={state === "bad" ? shake : undefined}>
              {o}
            </motion.button>
          );
        })}
      </div>
      {picked !== null && !finished && (
        <div className="panel mt-4 p-4 text-sm">
          <p>{s.why}</p>
          <button className="btn btn-plum mt-3 w-full" onClick={advance} autoFocus>
            Continue
          </button>
        </div>
      )}
      {finished && <Feedback item={item} correct={slips === 0} onNext={onNext} last={last} />}
    </div>
  );
}
