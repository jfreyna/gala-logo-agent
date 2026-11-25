/**
 * The steps of a project in order, with the cards each one writes.
 *
 * Steering reads this to know which steps come before the current one, and
 * the turn reads it to tell a current card from history: a step's card is
 * current only if no card of an earlier step came after it. Going back to
 * a step puts a new card for it in the conversation, and every later card
 * becomes history that way, with nothing deleted.
 *
 * No step moves on by itself: each waits for the person's approval, by a
 * button on its card or in words, before the next one opens.
 */
import type { Stage } from "./store.ts";

export type Step = {
  stage: Stage;
  /** The step's plain name, as Jev and the model are told it. */
  name: string;
  /** The kinds of card this step writes. */
  kinds: string[];
  /** True when a person can go back to this step. */
  canReturn: boolean;
};

export const STEPS: Step[] = [
  { stage: "brief", name: "the brief", kinds: ["brief"], canReturn: true },
  { stage: "research", name: "the research and the direction", kinds: ["research", "direction"], canReturn: true },
  { stage: "type", name: "the typeface for the name", kinds: ["typeSet"], canReturn: true },
  { stage: "wordmark", name: "the wordmark, the name set in the chosen typeface, its case and letter spacing", kinds: ["wordmark"], canReturn: true },
  { stage: "symbolOpener", name: "what the symbol should show", kinds: ["symbolOpener"], canReturn: true },
  { stage: "directions", name: "three directions for the symbol, the mark", kinds: ["conceptSet"], canReturn: true },
  { stage: "variations", name: "three variations of the chosen mark", kinds: ["variationSet"], canReturn: true },
  { stage: "stressTest", name: "the stress test of the mark", kinds: ["stressTest"], canReturn: true },
  { stage: "lockup", name: "the lockup, the symbol and the wordmark together, its layout and the space between them", kinds: ["lockup"], canReturn: true },
  { stage: "pickColors", name: "picking the colors", kinds: ["colorPicker"], canReturn: true },
  { stage: "colorways", name: "the three colorways", kinds: ["colorwaySet"], canReturn: true },
  { stage: "kit", name: "the kit", kinds: ["kit"], canReturn: true },
  { stage: "picks", name: "the picks for the halls", kinds: ["picks"], canReturn: false },
  { stage: "done", name: "the finished project", kinds: [], canReturn: false },
];

/** The step's place in the order, or -1. */
export function stepIndex(stage: Stage): number {
  return STEPS.findIndex((step) => step.stage === stage);
}

/** The place in the order of the step that writes this kind of card, or -1 for text and uploads. */
export function stepIndexOfKind(kind: string): number {
  return STEPS.findIndex((step) => step.kinds.includes(kind));
}

/** The steps before `stage` that a person can go back to. */
export function earlierSteps(stage: Stage): Step[] {
  return STEPS.slice(0, Math.max(stepIndex(stage), 0)).filter((step) => step.canReturn);
}

/** The last step a request can be held for. The kit and the picks take no requests, so nothing is promised for them. */
const LAST_HELD: Stage = "colorways";

/** The steps that draw the symbol. A request held for any of them reaches all of them. */
export const SYMBOL_STEPS: Stage[] = ["symbolOpener", "directions", "variations"];

/**
 * The steps after `stage` that a request can be held for. While the symbol
 * is being drawn, a request about the symbol is this step's own work, so
 * the other symbol steps are not "later".
 */
export function laterSteps(stage: Stage): Step[] {
  const later = STEPS.slice(stepIndex(stage) + 1, stepIndex(LAST_HELD) + 1);
  return SYMBOL_STEPS.includes(stage) ? later.filter((step) => !SYMBOL_STEPS.includes(step.stage)) : later;
}

export function isStage(value: unknown): value is Stage {
  return typeof value === "string" && STEPS.some((step) => step.stage === value);
}
