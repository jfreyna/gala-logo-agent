/**
 * What Gala knows about each step: what it can do there, what it can't,
 * and what the kit holds. One row per step in `steps.ts`.
 *
 * Every words-only reply is given its step's row (turn.ts), so Gala can say
 * plainly what it can't do and offer the closest thing it can. Jev decides
 * whether a message asks for something the step can't do, and which item
 * (steer.ts); the words model only writes the reply from these facts. The
 * hints read the same table, so what the person is told they can do and
 * what Gala does agree.
 *
 * `kitCanFinish` is true only for a finishing touch on a mark the person
 * keeps: a second color inside the symbol, the symbol's size against the
 * name. Never for the mark itself: reaching the kit means approving it, so
 * a mark the person rejects gets the way back instead.
 *
 * The wording is plain description of what the code does, read by the
 * model as facts. Nothing here is matched against what a person says.
 */
import type { Stage } from "./store.ts";

export type CantDo = {
  /** What the person might ask for, as a fact Gala can say. */
  what: string;
  /** Why not, in one clause. */
  reason: string;
  /** True when the kit's vector files let the person or a designer finish it. */
  kitCanFinish: boolean;
};

export type StepFacts = {
  /** What the step can do, each one a move the person can make. */
  canDo: string[];
  /** What Gala can't do here. */
  cantDo: CantDo[];
  /** The exact way out, for the second words-only reply in a row at this step. */
  wayOut: string;
};

/** What the kit holds, the same at every step (kit/). */
export const KIT_HOLDS: string[] = [
  "the primary and stacked lockups, the symbol alone, and the wordmark",
  "each in color, all black and all white",
  "SVG, EPS and PNG files, a square image and a social image",
  "a spec sheet with clear space, minimum sizes, the typeface, and each color's full ladder with hex, RGB and CMYK values",
];

/** The founder's kit line, checked against what the kit writes: each part is one vector path that opens in Figma. */
export const KIT_LINE = "the kit's vector files open in Figma, where you or a designer can take it from there";

/** After the brief, an attached image is stored but never looked at. */
const NO_IMAGES: CantDo = {
  what: "look at an image or screenshot sent after the brief",
  reason: "I only look at images while the brief is being written",
  kitCanFinish: false,
};

const SET_ASIDE: CantDo = { what: "use a draft that was set aside", reason: "a set-aside draft failed one of the checks", kitCanFinish: false };
const LETTERS_IN_MARK: CantDo = { what: "put letters inside the symbol", reason: "the name is set in type beside the symbol, and a mark with lettering is set aside", kitCanFinish: false };
const TWO_COLORS: CantDo = { what: "put two or more colors inside the symbol", reason: "the symbol is drawn in one color", kitCanFinish: true };
const GRADIENT: CantDo = { what: "use a gradient", reason: "each color is one flat color", kitCanFinish: true };
const COMBINE_KITS: CantDo = { what: "combine two finished kits", reason: "each project makes one kit", kitCanFinish: false };

export const STEP_FACTS: Record<Stage, StepFacts> = {
  brief: {
    canDo: ["answer the brief's questions", "send a reference image"],
    cantDo: [],
    wayOut: "tell me the brand's name and what it does, and I'll start the research",
  },
  research: {
    canDo: ["approve the direction", "ask for a change to the direction"],
    cantDo: [NO_IMAGES, { what: "redo the research itself", reason: "the research runs once; the direction is what changes", kitCanFinish: false }],
    wayOut: "say what the direction should feel like instead, and I'll revise it",
  },
  type: {
    canDo: ["choose one of the three typefaces", "swap a card's typeface for any Google Fonts family in the tray", "ask for three new typefaces", "set the name in another case"],
    cantDo: [NO_IMAGES, { what: "use a typeface that isn't on Google Fonts", reason: "I set type only from Google Fonts' families", kitCanFinish: false }],
    wayOut: "name a Google Fonts family and I'll set the name in it, or press Choose on one of the three",
  },
  wordmark: {
    canDo: ["set the case: as typed, all caps or lowercase", "set the letter spacing: tight, as drawn or wide", "go back and change the typeface", "use this wordmark"],
    cantDo: [
      NO_IMAGES,
      { what: "change the weight, the slant or a single letter of the wordmark", reason: "the wordmark takes the typeface as drawn, with only its case and spacing set", kitCanFinish: true },
      { what: "change the name beyond its case", reason: "the name is the brand's name from the brief", kitCanFinish: false },
    ],
    wayOut: "pick another typeface whose weight you like, or use this wordmark and finish the details from the kit",
  },
  symbolOpener: {
    canDo: ["describe what the symbol should show, and I'll draw three directions", "say go ahead, and I'll draw three", "ask for a logo of the name alone"],
    cantDo: [NO_IMAGES, { what: "use a symbol the person drew or uploaded", reason: "I draw every symbol myself so it can be checked and traced", kitCanFinish: false }, LETTERS_IN_MARK],
    wayOut: "describe the symbol you have in mind in words, and I'll draw three directions from it",
  },
  directions: {
    canDo: ["pick direction A, B or C", "describe a change, and I'll draw three new directions", "name a direction from an earlier round to work from"],
    cantDo: [NO_IMAGES, SET_ASIDE, LETTERS_IN_MARK],
    wayOut: "describe the mark you want in words, and I'll draw three new directions from that description",
  },
  variations: {
    canDo: ["pick variation 1, 2 or 3", "describe a change, and I'll draw three new variations", "name a mark from an earlier round to work from", "go back to the directions"],
    cantDo: [NO_IMAGES, SET_ASIDE, LETTERS_IN_MARK],
    wayOut: "go back to the directions with a description of the mark you want, and I'll draw three new directions from it",
  },
  stressTest: {
    canDo: ["approve the mark", "ask for a change, and I'll draw three new variations from it"],
    cantDo: [NO_IMAGES],
    wayOut: "approve the mark to go on to the lockup, or describe the change you want",
  },
  lockup: {
    canDo: ["set the layout: side by side or stacked", "set the space between the symbol and the name: tight, as set or wide", "change the symbol", "use this lockup"],
    cantDo: [
      NO_IMAGES,
      { what: "change the size of the symbol relative to the name, in either direction", reason: "the lockup sets only the layout and the space between", kitCanFinish: true },
      { what: "put the symbol to the right of the name", reason: "the lockup sets the symbol to the left or above", kitCanFinish: true },
      { what: "add the tagline to the lockup", reason: "the lockup holds the symbol and the name only", kitCanFinish: true },
    ],
    wayOut: "use this lockup and finish the sizing from the kit, or change the symbol",
  },
  pickColors: {
    canDo: ["pick a primary, a secondary and an optional tertiary color", "describe the colors in words"],
    cantDo: [NO_IMAGES, GRADIENT],
    wayOut: "type a hex value for each color, or describe them in words and I'll fill the card in",
  },
  colorways: {
    canDo: ["pick colorway A, B or C", "edit the colors", "change the symbol or the lockup, keeping the colors"],
    cantDo: [NO_IMAGES, TWO_COLORS, GRADIENT],
    wayOut: "pick the colorway closest to what you want and finish the color from the kit, or edit your colors",
  },
  kit: {
    canDo: ["download the files", "go back to any step to change it"],
    cantDo: [NO_IMAGES, TWO_COLORS, COMBINE_KITS],
    wayOut: "download the kit and finish the details in Figma, or go back to the step you want to change",
  },
  picks: {
    canDo: ["submit your best and worst picks for the halls", "choose not to submit", "go back to any step to change it"],
    cantDo: [NO_IMAGES, COMBINE_KITS],
    wayOut: "submit your picks or choose not to; the kit stays yours either way",
  },
  done: {
    canDo: ["download the files", "go back to any step to change it", "start a new project"],
    cantDo: [NO_IMAGES, TWO_COLORS, COMBINE_KITS],
    wayOut: "go back to the step you want to change, or start a new project",
  },
};

/** The three facts every words-only reply gets, for one step. */
export function factsFor(stage: Stage): { canDo: string[]; cantDo: { what: string; reason: string }[]; kitHolds: string[] } {
  const row = STEP_FACTS[stage];
  return { canDo: row.canDo, cantDo: row.cantDo.map(({ what, reason }) => ({ what, reason })), kitHolds: KIT_HOLDS };
}
