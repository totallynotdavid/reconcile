export type Source = {
  /** Odoo version the claim holds for, e.g. "18.0" or "19.4 (Online)". */
  version: string;
  /** Where it was read: a docs path, or "exam" for the author's own answers. */
  ref: string;
  /** False when the claim was not read in the documentation repo. */
  verified: boolean;
};

type Base = {
  id: string;
  /** Concept slug. Leitner boxes are kept per concept. */
  concept: string;
  /** Explains why the right answer is right, shown after every answer. */
  why: string;
  source?: Source;
};

export type ChoiceCard = Base & {
  kind: "choice";
  prompt: string;
  options: string[];
  answer: number;
};

export type BugCard = Base & {
  kind: "bug";
  prompt: string;
  language: "xml" | "python" | "sql" | "text";
  lines: string[];
  /** Index of the defective line. */
  answer: number;
};

export type TriageStep = { clue: string; options: string[]; answer: number; why: string };

export type TriageCard = Base & {
  kind: "triage";
  prompt: string;
  steps: TriageStep[];
};

/** Numbers are generated from a seed so a retry brings new figures. */
export type PredictCard = Base & {
  kind: "predict";
  scenario: PredictScenario;
};

export type PredictScenario =
  | "partial"
  | "two-partials"
  | "overpay"
  | "credit-note"
  | "waiting-bank";

export type Card = ChoiceCard | BugCard | TriageCard | PredictCard;

export type Level = {
  id: string;
  title: string;
  /** One sentence on what the level trains. */
  brief: string;
  /** Where the simple model lies. */
  caveat: string;
  cards: Card[];
};

export type Track = { id: string; title: string; summary: string; levels: Level[] };
