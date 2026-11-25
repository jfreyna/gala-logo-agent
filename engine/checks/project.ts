/**
 * A made-up project for the step checks, built card by card up to a step,
 * in memory. The marks are file ids that name no file: these checks never
 * draw, so nothing reads them.
 */
import { STEPS, stepIndex } from "../steps.ts";
import { MemoryStore } from "../store-memory.ts";
import type { Stage } from "../store.ts";

/** What each step leaves behind once it is signed off, in order. */
const SIGNED_OFF: [Stage, string, Record<string, unknown>][] = [
  [
    "brief",
    "brief",
    {
      say: "The brief is complete.",
      brand: "Ember & Rye",
      tagline: null,
      whatYouDo: "A wood-fired bakery in Madison",
      audience: "Neighbors and weekend visitors",
      whereUsed: ["Shop sign", "Paper bags", "Instagram"],
      never: ["fussy", "corporate", "cute"],
      pending: [],
    },
  ],
  [
    "research",
    "research",
    {
      say: "I looked at three competitors and three neighbors.",
      competitors: [
        { name: "Madison Sourdough", note: "A plain serif wordmark with a wheat sprig.", imageUrl: null },
        { name: "Batch Bakehouse", note: "A round badge with a rolling pin.", imageUrl: null },
        { name: "Origin Breads", note: "A hand-lettered script.", imageUrl: null },
      ],
      neighbors: [
        { name: "Colectivo Coffee", note: "A bold slab wordmark.", imageUrl: null },
        { name: "Fromagination", note: "A serif wordmark with a small wedge.", imageUrl: null },
        { name: "Graze", note: "A lowercase sans wordmark.", imageUrl: null },
      ],
    },
  ],
  ["research", "direction", { say: "Here is the direction.", mood: "Warm and sturdy", posture: "Grounded", energy: "Quiet confidence", references: ["the oven\u2019s arch", "a bread peel", "loaves rising"], approved: true }],
  [
    "type",
    "typeSet",
    {
      say: "Three typefaces for the name.",
      brandName: "Ember & Rye",
      directions: [
        { id: "type-a", letter: "A", family: "Young Serif", category: "Serif", moods: "Vintage, sincere", rationale: "", pick: "gala" },
        { id: "type-b", letter: "B", family: "Bitter", category: "Serif", moods: "Sturdy", rationale: "", pick: null },
        { id: "type-c", letter: "C", family: "Work Sans", category: "Sans", moods: "Calm", rationale: "", pick: null },
      ],
      chosenId: "type-a",
      saved: true,
      moodWeights: {},
    },
  ],
  ["wordmark", "wordmark", { say: "Here is Ember & Rye in Young Serif.", brandName: "Ember & Rye", family: "Young Serif", case: "asTyped", spacing: "asDrawn", letterSpacingEm: 0, readsAt16: true, approved: true }],
  ["symbolOpener", "symbolOpener", { say: "Now the symbol. What are you picturing?", ideas: ["the oven\u2019s arch", "a bread peel", "loaves rising"], answered: "goAhead" }],
  [
    "directions",
    "conceptSet",
    {
      say: "Three directions for the symbol.",
      concepts: [
        { id: "mark-a", letter: "A", name: "Hearth", rationale: "The oven\u2019s arch.", markFileId: "file-a", sourceFileId: "file-a", checks: [] },
        { id: "mark-b", letter: "B", name: "Peel", rationale: "A bread peel.", markFileId: "file-b", sourceFileId: "file-b", checks: [] },
        { id: "mark-c", letter: "C", name: "Rising", rationale: "Loaves rising.", markFileId: "file-c", sourceFileId: "file-c", checks: [] },
      ],
      discarded: [],
      chosenId: "mark-a",
    },
  ],
  [
    "variations",
    "variationSet",
    {
      say: "Three variations of Hearth.",
      concepts: [
        { id: "var-1", letter: "1", name: "Hearth, narrow", rationale: "", markFileId: "file-1", sourceFileId: "file-1", checks: [] },
        { id: "var-2", letter: "2", name: "Hearth, heavy", rationale: "", markFileId: "file-2", sourceFileId: "file-2", checks: [] },
        { id: "var-3", letter: "3", name: "Hearth, open", rationale: "", markFileId: "file-3", sourceFileId: "file-3", checks: [] },
      ],
      setAside: [],
      chosenId: "var-2",
    },
  ],
  ["stressTest", "stressTest", { say: "Hearth passes all four.", brandName: "Ember & Rye", markFileId: "file-2", sourceFileId: "file-2", checks: { sixteen: true, circle: true, inverted: true, poster: true }, approved: true }],
  ["lockup", "lockup", { say: "Hearth and your wordmark together.", brandName: "Ember & Rye", family: "Young Serif", letterSpacingEm: 0, markName: "Hearth, heavy", markFileId: "file-2", layout: "sideBySide", spaceBetween: "asSet", gapScale: 1, approved: true }],
];

/** What marks a card as not signed off yet. */
const OPEN: Record<string, Record<string, unknown>> = {
  direction: { approved: false },
  typeSet: { chosenId: null, saved: false },
  wordmark: { approved: false },
  symbolOpener: { answered: null },
  conceptSet: { chosenId: null },
  variationSet: { chosenId: null },
  stressTest: { approved: false },
  lockup: { approved: false },
};

/**
 * The project standing at `stage`, with that step's card on screen and not
 * signed off, and every earlier step signed off. `withCard: false` leaves
 * the step's own card out, as when the step has just opened.
 */
export function projectAt(stage: Stage, options: { withCard?: boolean } = {}): MemoryStore {
  const store = new MemoryStore();
  store.project = { id: "project", brandName: "Ember & Rye", stage };
  store.visitorSays("Ember & Rye, a wood-fired bakery in Madison. Never: fussy, corporate, cute.");
  const at = stepIndex(stage);
  for (const [step, kind, artifact] of SIGNED_OFF) {
    const index = stepIndex(step);
    if (index > at) break;
    if (index === at && options.withCard === false) continue;
    // Of a step's cards, only its last waits for the sign-off (the research step shows two).
    const last = !SIGNED_OFF.some(([otherStep, otherKind]) => otherStep === step && SIGNED_OFF.findIndex((entry) => entry[1] === otherKind) > SIGNED_OFF.findIndex((entry) => entry[1] === kind));
    store.messages.push({ id: `card-${kind}`, author: "gala", kind, text: null, artifact: { ...artifact, ...(index === at && last ? OPEN[kind] : {}) }, upload: null });
  }
  return store;
}

/** The step after `stage`, by name. */
export function stepAfter(stage: Stage): Stage {
  return STEPS[stepIndex(stage) + 1]!.stage;
}
