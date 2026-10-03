import type { BugCard, ChoiceCard, Source, TriageCard, TriageStep } from "./types";

const DOCS = {
  ormLog: "content/developer/reference/backend/orm/changelog.rst",
  extApi: "content/developer/reference/external_api.rst",
  upgrade: "content/developer/reference/upgrades/upgrade_scripts.rst",
  views: "content/developer/reference/user_interface/view_architectures.rst",
  views16: "content/developer/reference/backend/views.rst",
  orm: "content/developer/reference/backend/orm.rst",
  security: "content/developer/reference/backend/security.rst",
  jsref: "content/developer/reference/frontend/javascript_reference.rst",
  services: "content/developer/reference/frontend/services.rst",
  registries: "content/developer/reference/frontend/registries.rst",
  owl: "content/developer/reference/frontend/owl_components.rst",
  debug: "content/developer/reference/frontend/framework_overview.rst",
  upgradeService: "content/administration/upgrade.rst",
} as const;

export const doc = (version: string, file: keyof typeof DOCS): Source => ({
  version,
  ref: `odoo/documentation ${DOCS[file]}`,
});

export const map = (area: string, version: string): Source => ({
  version,
  ref: `docs/map/${area}.md (cited to odoo/documentation or odoo/odoo source)`,
});

/** A claim read in odoo/odoo source rather than the documentation. */
export const src = (version: string, path: string): Source => ({ version, ref: `odoo/odoo ${path}` });

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
