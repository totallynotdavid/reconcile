import type { BugCard, ChoiceCard, Source, TriageCard, TriageStep } from "./types";

const DOCS = {
  ormLog: "content/developer/reference/backend/orm/changelog.rst",
  extApi: "content/developer/reference/external_api.rst",
  upgrade: "content/developer/reference/upgrades/upgrade_scripts.rst",
  views: "content/developer/reference/user_interface/view_architectures.rst",
  views16: "content/developer/reference/backend/views.rst",
} as const;

export const doc = (version: string, file: keyof typeof DOCS): Source => ({
  version,
  ref: `odoo/documentation ${DOCS[file]}`,
  verified: true,
});

export const exam = (version = "17.0"): Source => ({ version, ref: "exam", verified: false });

export const unverified = (version: string, note: string): Source => ({ version, ref: note, verified: false });

/** The correct option goes first; the session shuffles the order. */
export function ch(
  id: string,
  concept: string,
  prompt: string,
  correct: string,
  wrong: string[],
  why: string,
  source?: Source,
): ChoiceCard {
  return { kind: "choice", id, concept, prompt, options: [correct, ...wrong], answer: 0, why, source };
}

export function bug(
  id: string,
  concept: string,
  prompt: string,
  language: BugCard["language"],
  lines: string[],
  answer: number,
  why: string,
  source?: Source,
): BugCard {
  return { kind: "bug", id, concept, prompt, language, lines, answer, why, source };
}

export function step(clue: string, correct: string, wrong: string[], why: string): TriageStep {
  return { clue, options: [correct, ...wrong], answer: 0, why };
}

export function triage(
  id: string,
  concept: string,
  prompt: string,
  steps: TriageStep[],
  why: string,
  source?: Source,
): TriageCard {
  return { kind: "triage", id, concept, prompt, steps, why, source };
}
