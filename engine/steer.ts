/**
 * Steering: what the person's message asks Gala to do with the work.
 *
 * Every message after the brief is read once, here, before the step runs.
 * During the brief every message is an answer, so it is not read.
 *
 *   1. Jev answers four yes or no questions in one call: does the message
 *      pick one of the options on screen, does it ask to go back to an
 *      earlier step or start over, does it ask for a change, and does it
 *      ask about one of the later steps. More than one can be yes. Each
 *      score is yes, no or unsure; unsure is a band around the middle, the
 *      same for all four.
 *   2. Only when something is yes does the conversation model fill in the
 *      details: which option, which step, which typeface, how the name is
 *      written, what to change in the drawing. Code checks each one against
 *      what is real before using it.
 *   3. Code moves the stage. When several are yes, in this order: go back,
 *      pick, change. When none is yes but one is unsure, or a detail does
 *      not check out, Gala asks one short question and nothing moves. When
 *      all are no, Gala answers in words.
 *   4. A request about a later step is never acted on where it was said.
 *      It is stored for its step in the person's own words, the stage
 *      stays, and Gala says where the project is and what comes next. The
 *      step reads it when it opens. A pick or a change for the current
 *      step in the same message still goes through.
 *
 * A sign-off (the one option that approves a step's work) is asked more
 * strictly than a pick among three: praise is not an approval.
 *
 * At the symbol opener "change" asks instead whether the message describes
 * what the symbol should show, and there is one more question: does the
 * message explicitly ask for a logo with no symbol. Only a clear yes
 * counts; an unsure answer gets one question.
 *
 * There are no phrase lists. The log line is the step and the three
 * scores, never the message.
 *
 * What this does not prove: each answer is one model's reading. A message
 * Jev scores confidently and wrongly moves the work the wrong way; going
 * back keeps every earlier card, so nothing is lost when that happens.
 */
import { fontData } from "./fonts.ts";
import type { Shape } from "./gemini.ts";
import { ask, SURE } from "./jev.ts";
import { broughtBackFixedLine } from "./lines.ts";
import { KIT_LINE, STEP_FACTS } from "./stepFacts.ts";
import { markOf, optionLabel, pickedRound, roundOptions, roundsOf, type RoundKind, type RoundOption } from "./rounds.ts";
import { CASE, inCase, LAYOUT, readSettings, SPACE_BETWEEN, SPACING } from "./settings.ts";
import { earlierSteps, laterSteps, STEPS, stepIndex, SYMBOL_STEPS, type Step } from "./steps.ts";
import type { Stage, StoredMessage } from "./store.ts";
import type { Exits, MarkRef, Request, Steering, Turn } from "./turn.ts";

/**
 * Half the width of the unsure band around 0.5. One number for every
 * question, not fitted to any message: at or above 0.7 is yes, at or
 * below 0.3 is no.
 */
export const UNSURE = 0.2;

export type Verdict = "yes" | "no" | "unsure";

export function verdictOf(score: number): Verdict {
  if (score >= 0.5 + UNSURE) return "yes";
  if (score <= 0.5 - UNSURE) return "no";
  return "unsure";
}

type Option = { key: string; label: string };

/** The steps whose card can be drawn in rounds, and each one's card. */
const ROUND_KINDS: Partial<Record<Stage, RoundKind>> = { directions: "conceptSet", variations: "variationSet", colorways: "colorwaySet" };
const ROUND_NOUN: Record<RoundKind, string> = { conceptSet: "Direction", variationSet: "Variation", colorwaySet: "Colorway" };

/** The steps with no options of their own: a person acts on their cards, or there is nothing left to choose. */
const NO_OPTIONS: Stage[] = ["brief", "pickColors", "kit", "picks", "done"];

/** The card a step shows, the one a request said at that step is written onto. */
function cardKind(stage: Stage): string | null {
  if (stage === "research") return "direction";
  return STEPS[stepIndex(stage)]?.kinds[0] ?? null;
}

/** The cards whose one option is a sign-off: approving the step's work as it stands. */
const SIGN_OFF_CARDS = ["direction", "wordmark", "symbolOpener", "stressTest", "lockup"];

/**
 * The options on screen at the current step, from its current card. None
 * once one is chosen. `signOff` is true when the one option approves the
 * step's work, which is asked of Jev more strictly than a pick among three.
 */
export function optionsOnScreen(turn: Turn): { card: StoredMessage; options: Option[]; signOff: boolean; rounds?: RoundOption[] } | null {
  const found = optionsOf(turn);
  return found === null ? null : { ...found, signOff: SIGN_OFF_CARDS.includes(found.card.kind) };
}

function optionsOf(turn: Turn): { card: StoredMessage; options: Option[]; rounds?: RoundOption[] } | null {
  if (NO_OPTIONS.includes(turn.stage)) return null;
  // A step drawn in rounds offers every option on every round; once any round carries a pick, the step has its answer.
  const roundKind = ROUND_KINDS[turn.stage];
  if (roundKind !== undefined) {
    const rounds = roundsOf(turn, roundKind);
    const newest = rounds[rounds.length - 1];
    if (newest === undefined || pickedRound(rounds) !== null) return null;
    const all = roundOptions(rounds, roundKind);
    return { card: newest, options: all.map((option) => ({ key: option.key, label: optionLabel(option, ROUND_NOUN[roundKind]) })), rounds: all };
  }
  const kind = cardKind(turn.stage);
  const card = kind === null ? null : turn.current(kind);
  if (card === null || card.artifact === null) return null;
  const set = card.artifact;
  switch (card.kind) {
    case "direction":
      return set.approved === true ? null : { card, options: [{ key: "approve", label: "Approve the direction as it is" }] };
    case "typeSet":
      return set.saved === true && set.chosenId !== null
        ? null
        : { card, options: set.directions.map((entry: { letter: string; family: string }) => ({ key: entry.letter, label: `Typeface ${entry.letter}, ${entry.family}` })) };
    case "wordmark":
      return set.approved === true ? null : { card, options: [{ key: "approve", label: "Use this wordmark as it is" }] };
    case "symbolOpener":
      return set.answered !== null ? null : { card, options: [{ key: "goAhead", label: "Go ahead and draw three directions for the symbol" }] };
    case "lockup":
      return set.approved === true ? null : { card, options: [{ key: "approve", label: "Use this lockup as it is" }] };
    case "conceptSet":
    case "variationSet": {
      const noun = card.kind === "conceptSet" ? "Direction" : "Variation";
      return set.chosenId !== null ? null : { card, options: set.concepts.map((entry: { letter: string; name: string }) => ({ key: entry.letter, label: `${noun} ${entry.letter}, ${entry.name}` })) };
    }
    case "stressTest":
      return set.approved === true ? null : { card, options: [{ key: "approve", label: "Approve the mark and go on to color" }] };
    case "colorwaySet":
      return set.chosenId !== null ? null : { card, options: set.colorways.map((entry: { letter: string; name: string }) => ({ key: entry.letter, label: `Colorway ${entry.letter}, ${entry.name || entry.letter}` })) };
    default:
      return null;
  }
}

export type Reading = { pick: number | null; back: number; change: number; later: number | null; noSymbol: number | null; bringBack: number | null; acceptsOffer: number | null; cannotDo: number | null; cannotDoWhat: string | null };

/** The answer that means a message asks for none of the step's can't-do items. */
const NONE_OF_THESE = "None of these";

/** The steps where a message describing the drawing counts as a change, and an unsure one gets an offer. */
const DRAWING_STEPS: Stage[] = ["directions", "variations", "lockup"];

/**
 * Jev's answers. `pick` is null when the step has no options, `later` when
 * no step that takes requests comes after this one, and `noSymbol`
 * everywhere but the symbol opener.
 */
/**
 * The questions, as Jev is asked them. Their wording was chosen on scores
 * from real lines (the held, gate and steering checks print them), and none
 * names a word a person might use.
 *
 *   - A pick among several options counts liking one as choosing it ("I
 *     like B"). A sign-off does not: praise for the work is not an
 *     approval, so the step stays until the person says to use it.
 *   - At the symbol opener the person is not changing work, they are
 *     describing what to draw, so that is what is asked.
 */
const ASKS = {
  pick: "Does `message` pick one of the options in `optionsOnScreen`: choosing it, approving it, or saying to go with it? Asking to see one again, or to bring one back up, is not choosing it.",
  signOff: "Does `message` tell Gala to go ahead with the option in `optionsOnScreen`: approving it, or saying to use it and move on? A compliment or a comment alone is not an approval.",
  back: "Does `message` ask to go back to one of the steps in `earlierSteps`, or to start over?",
  change: "Does `message` ask for something specific in the work to be changed or tried: the drawing, the typeface, how the name is written, or the direction?",
  idea: "Does `message` describe what the symbol should show or look like?",
  /**
   * At the drawing steps, asked in place of `change`: a person often
   * describes the drawing they want ("three bars, the top one cut to a
   * triangle") rather than asking for it, and that is a request too.
   */
  describe: "Does `message` ask for something specific in the work to be changed or tried, or describe what the drawing should show or look like, even without asking for it in so many words? A compliment, or a question about the drawings on screen, alone is not this.",
  acceptsOffer: "Gala offered to do `offer`. Does `message` say yes to it?",
  /** Asked where the step's row in stepFacts.ts lists things Gala can't do there: one pick among them, or none. */
  cannotDo: "Which of these does `message` ask Gala for, in whatever words? `sentAFile` says whether the person attached a file to the message.",
  later: "Does `message` ask for something that belongs to the work of one of the steps in `laterSteps`, and not to `currentStep`?",
  noSymbol: "Does `message` explicitly ask for a logo with no symbol at all, only the name?",
  /** Asked at a step drawn in rounds, once there is an earlier round: the person wants one back, as it was. */
  bringBack: "Does `message` ask to see again, or bring back up, one of the options in `optionsOnScreen` that is on an earlier round, as it was?",
} as const;

export async function read(turn: Turn, message: string, options: Option[], signOff = false, offer: string | null = null): Promise<Reading> {
  const step = STEPS[stepIndex(turn.stage)]!;
  const earlier = earlierSteps(turn.stage).map((entry) => entry.name);
  const later = laterSteps(turn.stage).map((entry) => entry.name);
  const roundKind = turn.stage === "directions" || turn.stage === "variations" ? ROUND_KINDS[turn.stage] : undefined;
  const hasEarlierRound = roundKind !== undefined && roundsOf(turn, roundKind).length > 1;
  const cantDo = STEP_FACTS[turn.stage].cantDo.map((entry) => entry.what);
  const answers = (await ask({
    state: {
      message,
      currentStep: step.name,
      optionsOnScreen: options.map((option) => option.label),
      earlierSteps: earlier,
      laterSteps: later,
      ...(offer !== null ? { offer } : {}),
      ...(cantDo.length > 0 ? { cantDo, sentAFile: turn.unanswered().some((entry) => entry.upload !== null) } : {}),
    },
    questions: {
      ...(options.length > 0 ? { pick: { type: "noul", instructions: signOff ? ASKS.signOff : ASKS.pick } as const } : {}),
      back: { type: "noul", instructions: ASKS.back },
      change: { type: "noul", instructions: turn.stage === "symbolOpener" ? ASKS.idea : DRAWING_STEPS.includes(turn.stage) ? ASKS.describe : ASKS.change },
      ...(offer !== null ? { acceptsOffer: { type: "noul", instructions: ASKS.acceptsOffer } as const } : {}),
      ...(cantDo.length > 0
        ? {
            cannotDo: {
              type: "choice",
              instructions: ASKS.cannotDo,
              criteria: { ...Object.fromEntries(STEP_FACTS[turn.stage].cantDo.map((entry) => [entry.what, entry.reason])), [NONE_OF_THESE]: "The message asks for none of the things above" },
            } as const,
          }
        : {}),
      ...(later.length > 0 ? { later: { type: "noul", instructions: ASKS.later } as const } : {}),
      ...(turn.stage === "symbolOpener" ? { noSymbol: { type: "noul", instructions: ASKS.noSymbol } as const } : {}),
      ...(hasEarlierRound ? { bringBack: { type: "noul", instructions: ASKS.bringBack } as const } : {}),
    },
    signal: turn.signal,
  })) as unknown as Record<string, { noul: number; choice?: string; confidence?: number } | undefined>;
  // A can't-do item counts only when Jev picks one of them, not "none", and is sure of it.
  const which = answers.cannotDo;
  const named = which !== undefined && which.choice !== NONE_OF_THESE ? (which.choice ?? null) : null;
  return { pick: answers.pick?.noul ?? null, back: answers.back!.noul, change: answers.change!.noul, later: answers.later?.noul ?? null, noSymbol: answers.noSymbol?.noul ?? null, bringBack: answers.bringBack?.noul ?? null, acceptsOffer: answers.acceptsOffer?.noul ?? null, cannotDo: which === undefined ? null : named !== null ? (which.confidence ?? 0) : 0, cannotDoWhat: named };
}

export function describeReading(stage: Stage, reading: Reading): string {
  const score = (value: number | null) => (value === null ? "none" : value.toFixed(2));
  const extra = (reading.noSymbol === null ? "" : `, no symbol ${score(reading.noSymbol)}`) + (reading.bringBack === null ? "" : `, bring back ${score(reading.bringBack)}`) + (reading.acceptsOffer === null ? "" : `, accepts offer ${score(reading.acceptsOffer)}`) + (reading.cannotDo === null ? "" : `, cannot do ${score(reading.cannotDo)}`);
  return `Steering at ${stage}: pick ${score(reading.pick)}, back ${score(reading.back)}, change ${score(reading.change)}, later ${score(reading.later)}${extra}`;
}

export type Details = { option: string; backTo: string; laterStep?: string; laterIdea?: string | null; startFrom?: string; typeface: string | null; nameAs: string | null; drawing: string | null; note: string | null };

/** The marks on this step's rounds a person can name to work from, by key, as the details call is told them. */
type Named = { key: string; label: string };

function detailsShape(options: Option[], earlier: Step[], later: Step[], marks: Named[], describes: boolean): Shape {
  const nullable = (description: string): Shape => ({ type: "STRING", nullable: true, description });
  return {
    type: "OBJECT",
    properties: {
      option: { type: "STRING", enum: [...options.map((option) => option.key), "none"], description: "The key of the option the person picks, or none" },
      backTo: {
        type: "STRING",
        enum: [...earlier.map((step) => step.stage), "none"],
        description: "The earlier step the person asks to go back to; brief when they ask to start over from the beginning; none when they don't ask to go back",
      },
      // Asked only when Jev said the message is about a later step, so every other message is read exactly as before.
      ...(later.length > 0
        ? {
            laterStep: {
              type: "STRING",
              enum: [...later.map((step) => step.stage), "none"],
              description: "The later step the person's request belongs to, when they ask for something that is not the current step's work; none otherwise",
            },
            laterIdea: nullable("What the person asks for that belongs to that later step, in their own words, or null"),
          }
        : {}),
      // Asked only where a step's marks are drawn in rounds, so every other step is read exactly as before.
      ...(marks.length > 0
        ? {
            startFrom: {
              type: "STRING",
              enum: [...marks.map((mark) => mark.key), "none"],
              description: "The key of the mark in marksShownInThisStep that the person names as the one to work from, refine or go back to; none when they name none of them. A mark the person picks goes in option as well",
            },
          }
        : {}),
      typeface: nullable("The typeface family the person names for the brand name, as they wrote it, or null"),
      nameAs: nullable("How the person wants the brand name written, spelled out exactly as it should appear (for example in all capitals), or null"),
      drawing: nullable(
        describes
          ? "What the person asks to change or try in the drawing of the mark, or the drawing they describe wanting (what it should show or look like), in their own words, or null"
          : "What the person asks to change or try in the drawing of the mark, in their own words, or null",
      ),
      note: nullable("Any other change the person asks for, in their own words, or null"),
    },
    required: ["option", "backTo", ...(later.length > 0 ? ["laterStep", "laterIdea"] : []), ...(marks.length > 0 ? ["startFrom"] : []), "typeface", "nameAs", "drawing", "note"],
  };
}

/** The details, filled in by the conversation model only. */
async function details(turn: Turn, options: Option[], earlier: Step[], later: Step[], marks: Named[]): Promise<Details> {
  return turn.think<Details>({
    section: "conversation",
    task: "Read the person's last message and fill in only what it says. Leave everything it does not say as none or null. Say nothing to the person.",
    facts: {
      brand: turn.brand,
      currentStep: STEPS[stepIndex(turn.stage)]!.name,
      optionsOnScreen: options,
      earlierSteps: earlier.map((step) => ({ key: step.stage, name: step.name })),
      ...(later.length > 0 ? { laterSteps: later.map((step) => ({ key: step.stage, name: step.name })) } : {}),
      ...(marks.length > 0 ? { marksShownInThisStep: marks } : {}),
    },
    // At the drawing steps a described drawing is a request too, so the drawing field takes it.
    shape: detailsShape(options, earlier, later, marks, DRAWING_STEPS.includes(turn.stage)),
  });
}

/** A free-text detail, or null when it is empty or fails the reply check. */
async function mayKeep(turn: Turn, value: string | null): Promise<string | null> {
  if (value === null) return null;
  if (await turn.mayShow({ line: "", card: [value] })) return value;
  console.warn("Steering: a detail was dropped because it failed the reply check.");
  return null;
}

/** The Google family by that name, ignoring case, spacing and punctuation, or null. */
export async function googleFamily(name: string): Promise<string | null> {
  const plain = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const wanted = plain(name);
  if (wanted === "") return null;
  return (await fontData()).families.find((family) => plain(family.family) === wanted)?.family ?? null;
}

/** True when `written` is the brand's own name, only in another case or spacing. */
export function isTheName(written: string, brand: string): boolean {
  const plain = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  return brand.trim() !== "" && plain(written) === plain(brand);
}

const NOTHING: Request = { typeface: null, nameAs: null, drawing: null, note: null };

export function asksForSomething(request: Request | null): request is Request {
  return request !== null && (request.typeface !== null || request.nameAs !== null || request.drawing !== null || request.note !== null || (request.startFrom ?? null) !== null);
}

/**
 * The details checked against what is real. A detail that doesn't check out
 * is named in `problem`. The two free-text details are written by a model
 * and end up on cards the person sees, so each passes the same reply check
 * as anything Gala shows; one that fails is dropped, as if no such detail
 * was given, and only the check's name and score are logged.
 */
export async function checked(turn: Turn, found: Details, rounds: RoundOption[]): Promise<{ request: Request; problem: Record<string, unknown> | null }> {
  const [drawing, note] = await Promise.all([found.drawing, found.note].map((value) => mayKeep(turn, value?.trim() || null)));
  const request: Request = { ...NOTHING, drawing: drawing ?? null, note: note ?? null };
  // A named mark is used only if it is a real mark on one of this step's rounds.
  const named = found.startFrom === undefined || found.startFrom === "none" ? undefined : rounds.find((option) => option.key === found.startFrom);
  if (named !== undefined) request.startFrom = markOf(named);
  if (found.typeface !== null && found.typeface.trim() !== "") {
    const family = await googleFamily(found.typeface);
    if (family === null) return { request, problem: { typefaceNotOnGoogle: found.typeface.trim() } };
    request.typeface = family;
  }
  if (found.nameAs !== null && found.nameAs.trim() !== "" && found.nameAs.trim() !== turn.brand) {
    if (!isTheName(found.nameAs, turn.brand)) return { request, problem: { nameCanOnlyChangeCase: { brand: turn.brand, asked: found.nameAs.trim() } } };
    request.nameAs = found.nameAs.trim();
  }
  return { request, problem: null };
}

/**
 * An offer Gala made: the exact request a yes runs, its words, and where the
 * conversation stood when it was made. `pressed` is set by the reply
 * buttons (convex/studio.ts `answerOffer`): the answer waits on the
 * card for the turn the press wakes.
 */
export type Offer = { request: Request; moveToOffer: string; afterMessages: number; pressed?: "yes" | "no"; keepSymbol?: KeepSymbol };

/**
 * The offer to keep the approved symbol through a change to the
 * name's case or the typeface. `to` is the step the change goes back to; a
 * yes keeps the symbol, any other answer takes today's path. Either way the
 * change itself is made.
 */
export type KeepSymbol = { name: string; to: "wordmark" | "type" };

/**
 * An offer once answered, typed or pressed, kept on its card so the reply
 * buttons under the line that made it show Done after a reload.
 * The standing offer itself is cleared, as before.
 */
export type AnsweredOffer = { afterMessages: number; answer: "yes" | "no"; keepSymbol?: true };

/** The card's artifact with its offer cleared and the answer recorded. */
function answering(card: StoredMessage, offer: Offer, answer: "yes" | "no"): Record<string, unknown> {
  const answered = (card.artifact!.answeredOffers as AnsweredOffer[] | undefined) ?? [];
  const entry: AnsweredOffer = { afterMessages: offer.afterMessages, answer, ...(offer.keepSymbol !== undefined ? { keepSymbol: true as const } : {}) };
  return { ...card.artifact!, offer: null, answeredOffers: [...answered.filter((kept) => kept.afterMessages !== offer.afterMessages), entry] };
}

/** The card an offer at this step is stored on: the newest round, the lockup card, or after the lockup the approved stress test card. */
function offerCard(turn: Turn): StoredMessage | null {
  const roundKind = ROUND_KINDS[turn.stage];
  if (roundKind !== undefined) return roundsOf(turn, roundKind).at(-1) ?? null;
  if (turn.stage === "lockup") return turn.current("lockup");
  return stepIndex(turn.stage) > stepIndex("lockup") ? (approvedSymbol(turn)?.card ?? null) : null;
}

/**
 * The approved symbol: the newest stress test card, approved,
 * with the name of the variation it tested. Null before the stress test is
 * approved, or at a step not after it.
 */
export function approvedSymbol(turn: Turn): { card: StoredMessage; name: string } | null {
  if (stepIndex(turn.stage) <= stepIndex("stressTest")) return null;
  const card = turn.state.messages.findLast((message) => message.author === "gala" && message.kind === "stressTest" && message.artifact !== null) ?? null;
  if (card === null || card.artifact!.approved !== true) return null;
  const set = turn.state.messages.findLast((message) => message.kind === "variationSet" && message.artifact !== null)?.artifact;
  const chosen = (set?.concepts as { id: string; name: string }[] | undefined)?.find((concept) => concept.id === set?.chosenId);
  return chosen === undefined ? null : { card, name: chosen.name };
}

/**
 * A change to the name's case or the typeface, which goes back to `to`.
 * With an approved symbol, Gala first offers to keep it; the
 * change itself waits on the answer. Without one: today's go back.
 */
export async function nameChange(turn: Turn, to: "wordmark" | "type", request: Request): Promise<void> {
  const symbol = approvedSymbol(turn);
  const card = symbol === null ? null : offerCard(turn);
  if (symbol === null || card === null) return goBack(turn, to, request);
  const moveToOffer = `keep ${symbol.name} as the symbol and set it beside the new wordmark, redoing only the lockup and the kit`;
  const stored: Offer = { request, moveToOffer, afterMessages: turn.state.messages.length, keepSymbol: { name: symbol.name, to } };
  await turn.write([{ op: "patchArtifact", messageId: card.id, artifact: { ...card.artifact!, offer: stored } }]);
  console.log(`Steering at ${turn.stage}: a name change after the symbol was approved, so Gala offers to keep ${symbol.name}`);
  turn.steer({ act: "offer", moveToOffer, symbolName: symbol.name });
}

/** The answer to a keep-the-symbol offer: a yes marks the symbol kept; either way the change goes back as today. */
async function answerKeepSymbol(turn: Turn, offer: Offer, keep: boolean): Promise<void> {
  if (keep) {
    const symbol = approvedSymbol(turn);
    if (symbol !== null) await turn.write([{ op: "patchArtifact", messageId: symbol.card.id, artifact: { ...symbol.card.artifact!, keptSymbol: true } }]);
  }
  return goBack(turn, offer.keepSymbol!.to, offer.request);
}

/**
 * The offer still standing: stored on the step's card, and nothing Gala
 * wrote after the reply that made it. Only the person's next message can
 * answer it.
 */
export function pendingOffer(turn: Turn): { card: StoredMessage; offer: Offer } | null {
  const card = offerCard(turn);
  const offer = card?.artifact?.offer as Offer | null | undefined;
  if (card === null || offer === null || offer === undefined) return null;
  const galaSince = turn.state.messages.slice(offer.afterMessages + 1).some((message) => message.author === "gala");
  return galaSince ? null : { card, offer };
}

/**
 * A "Back to directions" press waiting for this turn: stored on
 * a card's newest exits, with no answer yet and nothing Gala wrote after
 * the line it sits under. `description` is the person's last words before
 * that line, carried as the drawing request the way a typed "go back to the
 * directions with this" carries it.
 */
export function pressedExit(turn: Turn): { card: StoredMessage; exits: Exits; all: Exits[]; description: string | null } | null {
  for (const card of [...turn.state.messages].reverse()) {
    if (card.author !== "gala" || card.artifact === null || !Array.isArray(card.artifact.exits)) continue;
    const all = card.artifact.exits as Exits[];
    const exits = all.at(-1);
    if (exits === undefined || exits.pressed !== "directions" || exits.answered === true) return null;
    if (turn.state.messages.slice(exits.afterMessages + 1).some((message) => message.author === "gala")) return null;
    const said = turn.state.messages.slice(0, exits.afterMessages).findLast((message) => message.author === "visitor" && (message.text ?? "").trim() !== "");
    return { card, exits, all, description: said?.text?.trim() ?? null };
  }
  return null;
}

/** The offer in plain words, from the request itself: what would be drawn, from which mark. */
function offerWords(stage: Stage, request: Request): string {
  const what = [request.drawing, request.note].filter((entry): entry is string => entry !== null).join("; ");
  const from = request.startFrom ? `, starting from ${request.startFrom.name}` : "";
  if (stage === "directions") return `redraw the three directions with this: ${what}${from}`;
  if (stage === "variations") return `redraw the three variations with this: ${what}${from}`;
  return request.drawing !== null ? `draw new variations of the symbol with this: ${what}` : `change the lockup with this: ${what}`;
}

/**
 * True when a request said for the wordmark or the lockup names one of
 * that step's settings, the only way those steps read a held request.
 */
async function settingsCanRead(turn: Turn, step: Stage, idea: string): Promise<boolean> {
  if (step !== "wordmark" && step !== "lockup") return true;
  const read = step === "wordmark"
    ? await readSettings(idea, { case: { setting: CASE, current: "asTyped" }, spacing: { setting: SPACING, current: "asDrawn" } }, turn.signal)
    : await readSettings(idea, { layout: { setting: LAYOUT, current: "sideBySide" }, spaceBetween: { setting: SPACE_BETWEEN, current: "asSet" } }, turn.signal);
  return Object.values(read).some((entry) => entry.asked);
}

/**
 * Reads the person's message and moves the work. Runs once per turn,
 * before the step. `back` is a "Back to this step" press in the Work
 * panel, which takes the same move as a spoken "go back".
 */
export async function steer(turn: Turn, options: { back?: Stage } = {}): Promise<void> {
  if (options.back !== undefined) {
    if (earlierSteps(turn.stage).some((step) => step.stage === options.back)) await goBack(turn, options.back, null);
    return;
  }
  if (turn.stage === "brief") return;
  const message = turn.unansweredText();
  turn.said = message;
  if (message === "") {
    // A reply button on an offer: exactly what the typed answer does. A yes runs the stored request; a no clears it, and Gala answers the press.
    const standing = pendingOffer(turn);
    if (standing?.offer.pressed !== undefined) {
      const answer = standing.offer.pressed;
      await turn.write([{ op: "patchArtifact", messageId: standing.card.id, artifact: answering(standing.card, standing.offer, answer) }]);
      if (standing.offer.keepSymbol !== undefined) return answerKeepSymbol(turn, standing.offer, answer === "yes");
      if (answer === "no") return turn.steer({ act: "talk" });
      await keep(turn, { ...standing.offer.request, drawing: null }, null);
      return turn.steer({ act: "redo", request: standing.offer.request });
    }
    // "Back to directions" after a second dead end: the typed path, a go back to the directions with the person's last description.
    const exit = pressedExit(turn);
    if (exit !== null) {
      await turn.write([{ op: "patchArtifact", messageId: exit.card.id, artifact: { ...exit.card.artifact!, exits: exit.all.map((entry) => (entry === exit.exits ? { ...entry, answered: true } : entry)) } }]);
      return goBack(turn, "directions", exit.description === null ? null : { ...NOTHING, drawing: exit.description });
    }
    // A file with no words still gets an answer, never silence. A button press has no file and is answered by its step.
    const files = turn.unanswered().flatMap((entry) => (entry.upload !== null ? [entry.upload.fileName] : []));
    if (files.length > 0) turn.steer({ act: "talk", facts: { sentAFileWithNoWords: files } });
    return;
  }

  // An offer is answered by the next message only: it is cleared whatever that message says, and a yes runs it exactly.
  const standing = pendingOffer(turn);
  if (standing !== null) await turn.write([{ op: "patchArtifact", messageId: standing.card.id, artifact: answering(standing.card, standing.offer, "no") }]);

  const onScreen = optionsOnScreen(turn);
  const choices = onScreen?.options ?? [];
  const reading = await read(turn, message, choices, onScreen?.signOff ?? false, standing?.offer.moveToOffer ?? null);
  console.log(describeReading(turn.stage, reading));
  // A keep-the-symbol offer is answered either way: a yes keeps it, anything else takes today's path.
  if (standing?.offer.keepSymbol !== undefined) {
    const yes = verdictOf(reading.acceptsOffer ?? 0) === "yes";
    if (yes) {
      const card = turn.state.messages.find((entry) => entry.id === standing.card.id) ?? standing.card;
      await turn.write([{ op: "patchArtifact", messageId: card.id, artifact: answering(card, standing.offer, "yes") }]);
    }
    return answerKeepSymbol(turn, standing.offer, yes);
  }
  if (standing !== null && verdictOf(reading.acceptsOffer ?? 0) === "yes" && verdictOf(reading.back) !== "yes") {
    const card = turn.state.messages.find((entry) => entry.id === standing.card.id) ?? standing.card;
    await turn.write([{ op: "patchArtifact", messageId: card.id, artifact: answering(card, standing.offer, "yes") }]);
    await keep(turn, { ...standing.offer.request, drawing: null }, null);
    return turn.steer({ act: "redo", request: standing.offer.request });
  }

  const verdict = (score: number | null): Verdict => (score === null ? "no" : verdictOf(score));
  const back = verdict(reading.back);
  const pick = verdict(reading.pick);
  const later = verdict(reading.later);
  const noSymbol = verdict(reading.noSymbol);
  const change = verdict(reading.change);
  const backUp = verdict(reading.bringBack);

  // Something the step can't do, asked for with no go back or pick: Gala says so, with the closest move (stepFacts.ts).
  if (reading.cannotDoWhat !== null && (reading.cannotDo ?? 0) >= SURE && back !== "yes" && pick !== "yes") return cannotDoReply(turn, message, reading.cannotDoWhat);

  // A logo with no symbol: only on a clear yes. An unsure answer gets one question.
  if (back !== "yes" && noSymbol !== "no") {
    return turn.steer(noSymbol === "yes" ? { act: "noSymbol" } : { act: "ask", facts: { askWhether: "the person wants a logo with no symbol at all, only the name" } });
  }

  // A yes acts, in the order go back, pick, change. Unsure asks only when nothing is a yes.
  const decides = back === "yes" ? { move: "back" } : pick === "yes" ? { move: "pick" } : backUp === "yes" ? { move: "bringBack" } : change === "yes" ? { move: "change" } : null;
  // At a drawing step, a change Jev is unsure of gets an offer to do exactly what the message says, stored so a yes runs it.
  if (decides === null && later !== "yes" && change === "unsure" && back !== "unsure" && pick !== "unsure" && backUp !== "unsure" && DRAWING_STEPS.includes(turn.stage)) {
    return offer(turn, onScreen);
  }
  if (decides === null && later !== "yes") {
    return turn.steer([back, pick, backUp, change, later].includes("unsure") ? { act: "ask" } : { act: "talk" });
  }

  const earlier = earlierSteps(turn.stage);
  const after = laterSteps(turn.stage);
  // The marks on every round of a drawing step, each a real card's, for the person to name one.
  const marks = turn.stage === "directions" || turn.stage === "variations" ? (onScreen?.rounds ?? []) : [];
  const found = await details(
    turn,
    choices,
    earlier,
    later === "yes" ? after : [],
    marks.map((option) => ({ key: option.key, label: optionLabel(option, ROUND_NOUN[ROUND_KINDS[turn.stage]!]) })),
  );

  // A request for a later step is stored for it and never acted on here.
  let held: { step: Stage; idea: string } | null = null;
  if (later === "yes") {
    const step = after.find((entry) => entry.stage === found.laterStep);
    const idea = found.laterIdea?.trim() ?? "";
    if (step === undefined || idea === "") {
      if (decides === null) return turn.steer({ act: "ask" });
    } else if (!(await settingsCanRead(turn, step.stage, idea))) {
      // The wordmark and the lockup read a held request only as one of their settings: anything else is not promised.
      console.log(`Steering at ${turn.stage}: a request for ${step.stage} names none of its settings, so it is not kept`);
      if (decides === null) return turn.steer({ act: "talk", facts: { notKept: { step: step.name, whatWasAsked: idea.slice(0, MAX_HELD_LENGTH), thatStepCanSet: step.stage === "wordmark" ? [CASE.about, SPACING.about] : [LAYOUT.about, SPACE_BETWEEN.about] } } });
    } else {
      // A typeface kept for the type step is kept by its name on Google's list, so the step can set it.
      const family = step.stage === "type" && found.typeface ? await googleFamily(found.typeface) : null;
      held = { step: step.stage, idea: family ?? idea.slice(0, MAX_HELD_LENGTH) };
      await turn.write([{ op: "hold", step: held.step, text: held.idea }]);
      // The same words must not also change the work here.
      if (step.stage === "type") found.typeface = null;
      if (SYMBOL_STEPS.includes(step.stage) || step.stage === "lockup") found.drawing = null;
      if (step.stage === "wordmark") found.nameAs = null;
    }
  }

  const { request, problem } = await checked(turn, found, marks);
  if (problem !== null) {
    console.log(`Steering at ${turn.stage}: a detail did not check out (${Object.keys(problem).join(", ")})`);
    // A typeface Google doesn't have is said plainly; anything else gets one question.
    return turn.steer(problem.typefaceNotOnGoogle !== undefined ? { act: "talk", facts: problem } : { act: "ask", facts: problem });
  }
  const keptOnly: Steering | null = held === null ? null : { act: "held", step: held.step, idea: held.idea };

  // At the colorways and after, a "go back" that names no step but asks for a change is that change, sent to its step below.
  const backToNoStep = decides?.move === "back" && earlier.every((step) => step.stage !== found.backTo);
  if (decides?.move === "back" && !(backToNoStep && change === "yes" && AFTER_COLOR.includes(turn.stage) && !request.startFrom)) {
    const to = earlier.find((step) => step.stage === found.backTo);
    // Going back to a mark on one of this step's rounds with no change: that round comes back, unpicked, and nothing is drawn.
    if (to === undefined && request.startFrom && !asksForChange(request)) return bringBack(turn, request.startFrom, marks);
    // With a change, the step draws again from that mark.
    if (to === undefined && request.startFrom) {
      await keep(turn, { ...request, drawing: null }, null);
      return turn.steer({ act: "redo", request: change === "no" ? { ...NOTHING, startFrom: request.startFrom } : request });
    }
    if (to === undefined) return turn.steer(keptOnly ?? { act: "ask" });
    const asks = change === "no" ? null : request;
    // A typeface is shown only on the type card: going back with one named lands there, whichever later step was named.
    const target = asks !== null && asks.typeface !== null && stepIndex(to.stage) > stepIndex("type") ? "type" : to.stage;
    // A change to the name or typeface after the symbol was approved: Gala offers to keep the symbol first.
    if (asks !== null && (target === "type" || target === "wordmark") && (asks.typeface !== null || asks.nameAs !== null)) return nameChange(turn, target, asks);
    return goBack(turn, target, asks);
  }

  // An earlier round asked for back: as it was, it comes back unpicked; with a change, the step draws from the named mark.
  if (decides?.move === "bringBack") {
    if (!request.startFrom) return turn.steer(keptOnly ?? { act: "ask" });
    if (!asksForChange(request)) return bringBack(turn, request.startFrom, marks);
    await keep(turn, { ...request, drawing: null }, null);
    return turn.steer({ act: "redo", request });
  }

  if (decides?.move === "pick") {
    // A pick whose option came back as none but that names a real mark on the step's rounds picks that mark.
    const named = request.startFrom ? onScreen?.rounds?.find((entry) => entry.id === request.startFrom!.id) : undefined;
    const option = choices.find((entry) => entry.key === found.option) ?? (named !== undefined ? choices.find((entry) => entry.key === named.key) : undefined);
    if (option === undefined || onScreen === null) {
      console.log(`Steering at ${turn.stage}: the pick named no option on screen`);
      return turn.steer(keptOnly ?? { act: "ask" });
    }
    // At the variations, a change asked for with the pick is drawn first, from the picked mark, and the step waits for the new round.
    const pickedMark = onScreen.rounds?.find((entry) => entry.key === option.key);
    if (turn.stage === "variations" && change === "yes" && pickedMark !== undefined && (request.drawing !== null || request.note !== null)) {
      await keep(turn, { ...request, drawing: null }, null);
      return turn.steer({ act: "redo", request: { ...request, startFrom: markOf(pickedMark) } });
    }
    // Elsewhere a change asked for in the same message goes along with the pick.
    await keep(turn, change === "no" ? NOTHING : request, onScreen.card);
    await choose(turn, pickedMark?.card ?? onScreen.card, pickedMark?.id ?? option.key);
    return;
  }

  // Only a later step was asked about, or what is left for this step is nothing: the stage stays.
  if (decides === null || (held !== null && !asksForSomething(request))) return turn.steer(keptOnly ?? { act: "ask" });

  // A typeface is shown only on the type card, and the name's case only on the wordmark card: a change to either after it goes back there.
  if (request.typeface !== null && stepIndex(turn.stage) > stepIndex("type")) return nameChange(turn, "type", request);
  if (request.nameAs !== null && stepIndex(turn.stage) > stepIndex("wordmark")) return nameChange(turn, "wordmark", request);
  // A mark from this step's rounds named with nothing to change in it: that round comes back, as with "go back to it".
  if (request.startFrom && !asksForChange(request)) return bringBack(turn, request.startFrom, marks);
  // At colorways and after, a change goes to the step whose work it is, the colors kept, instead of reopening the color card.
  if (AFTER_COLOR.includes(turn.stage)) {
    const part = await partOf(turn, message);
    const said = [request.drawing, request.note].filter((entry): entry is string => entry !== null).join("; ");
    if (part === "symbol") return goBack(turn, "variations", { ...request, drawing: said || null, note: null });
    if (part === "lockup") return goBack(turn, "lockup", request);
    if (part === "colors" && turn.stage !== "colorways") return goBack(turn, "pickColors", { ...request, drawing: null, note: said || null });
    // The name's case or typeface would have been named above; anything else about the name, or an unclear part, gets one question.
    if (part === null || part === "name") return turn.steer({ act: "ask" });
  }
  await keep(turn, { ...request, drawing: null }, null);
  return turn.steer({ act: "redo", request });
}

/** True when a request asks for something to change in the work, not only names a mark. */
function asksForChange(request: Request): boolean {
  return request.drawing !== null || request.note !== null || request.typeface !== null || request.nameAs !== null;
}

/**
 * Brings an earlier round back as the newest card, unpicked, with Gala's
 * line naming the mark and its round. Nothing is drawn: the person asked
 * for that round, not three new ones. The step then waits, and the person
 * can pick from it or ask for a change, which draws from the named mark.
 */
async function bringBack(turn: Turn, mark: MarkRef, marks: RoundOption[]): Promise<void> {
  const option = marks.find((entry) => entry.id === mark.id);
  if (option === undefined) return turn.steer({ act: "ask" });
  const line = await turn.compose(
    () =>
      turn.think<{ say: string }>({
        section: turn.stage === "directions" ? "directions" : "variations",
        task: "The person asked for an earlier round back, with no change. You brought that round back as it was, and drew nothing new. Say so in one short sentence, naming broughtBackFromEarlierRound and the round it came from, then ask them to pick one or say what to change.",
        facts: { broughtBackFromEarlierRound: mark.name, round: option.place },
        shape: { type: "OBJECT", properties: { say: { type: "STRING" } }, required: ["say"] },
      }),
    (value) => ({ line: value.say }),
  );
  console.log(`Steering at ${turn.stage}: an earlier round brought back, nothing drawn`);
  await turn.write([
    {
      op: "artifact",
      kind: option.card.kind,
      artifact: { ...option.card.artifact!, chosenId: null, say: line?.say ?? broughtBackFixedLine(mark.name, option.place.roundsAfterIt), broughtBack: option.place },
    },
  ]);
  turn.steer(null);
}

/** The longest request kept for a later step. */
const MAX_HELD_LENGTH = 500;

/** The steps from the colorways on, where a change can be about any part of the logo. */
const AFTER_COLOR: Stage[] = ["colorways", "kit", "picks", "done"];

/** The parts of the logo a change can be about, as Jev is told them. */
const PARTS = {
  symbol: { label: "The symbol", means: "The drawn mark itself: its shape or its details" },
  lockup: { label: "The lockup", means: "How the symbol and the name sit together: the layout or the space between them" },
  colors: { label: "The colors", means: "Which colors are used, or where" },
  name: { label: "The name", means: "How the name is written, or its typeface" },
} as const;

/** Which part of the logo a change is about, by one Jev choice; null when Jev isn't sure. */
async function partOf(turn: Turn, message: string): Promise<keyof typeof PARTS | null> {
  const answers = await ask({
    state: { message },
    questions: { part: { type: "choice", instructions: "Which part of the logo does `message` ask to change?", criteria: Object.fromEntries(Object.values(PARTS).map((part) => [part.label, part.means])) } },
    signal: turn.signal,
  });
  if (answers.part.confidence < SURE) return null;
  return (Object.keys(PARTS) as (keyof typeof PARTS)[]).find((key) => PARTS[key].label === answers.part.choice) ?? null;
}

/**
 * The can't-do reply. Jev picks which of the step's can't-do items the
 * message asks for, the closest move among what the step can do, and
 * whether the person rejects the mark as it is. The kit line goes only to
 * a finishing touch on a mark the person keeps; a rejected mark gets the
 * closest move back instead.
 */
async function cannotDoReply(turn: Turn, message: string, what: string): Promise<void> {
  const row = STEP_FACTS[turn.stage];
  const answers = await ask({
    state: { message },
    questions: {
      closest: { type: "choice", instructions: "Which of these is the closest thing to what `message` asks for?", criteria: Object.fromEntries(row.canDo.map((entry) => [entry, null])) },
      rejects: { type: "noul", instructions: "Does `message` reject the mark itself, saying the symbol or the name is wrong and should be replaced or drawn again, rather than asking for a finishing touch to a mark the person keeps?" },
    },
    signal: turn.signal,
  });
  const item = row.cantDo.find((entry) => entry.what === what)!;
  const rejects = answers.rejects.noul >= 0.5;
  const kitCanFinish = item.kitCanFinish && !rejects;
  console.log(`Steering at ${turn.stage}: can't do it (kit can finish: ${kitCanFinish})`);
  turn.steer({
    act: "talk",
    facts: { cannotDo: item.what, reason: item.reason, closestMove: answers.closest.choice, kitCanFinish, ...(kitCanFinish ? { kitLine: KIT_LINE } : {}) },
  });
}

/**
 * The offer: the details are read as for a change, checked the same way,
 * and stored on the step's card with their words. Nothing is drawn. When
 * the details hold no drawing and no change, Gala asks one question
 * instead.
 */
async function offer(turn: Turn, onScreen: ReturnType<typeof optionsOnScreen>): Promise<void> {
  const marks = turn.stage === "directions" || turn.stage === "variations" ? (onScreen?.rounds ?? []) : [];
  const found = await details(turn, onScreen?.options ?? [], earlierSteps(turn.stage), [], marks.map((option) => ({ key: option.key, label: optionLabel(option, ROUND_NOUN[ROUND_KINDS[turn.stage]!]) })));
  const { request, problem } = await checked(turn, found, marks);
  const card = offerCard(turn);
  if (problem !== null || card === null || (request.drawing === null && request.note === null)) return turn.steer({ act: "ask" });
  const moveToOffer = offerWords(turn.stage, request);
  const stored: Offer = { request, moveToOffer, afterMessages: turn.state.messages.length };
  await turn.write([{ op: "patchArtifact", messageId: card.id, artifact: { ...card.artifact!, offer: stored } }]);
  console.log(`Steering at ${turn.stage}: unsure of a change, so Gala offers it`);
  turn.steer({ act: "offer", moveToOffer });
}

/** The same change the Choose or Approve button makes. */
async function choose(turn: Turn, card: StoredMessage, key: string): Promise<void> {
  const fresh = turn.state.messages.find((message) => message.id === card.id) ?? card;
  const set = fresh.artifact!;
  // A round's option is named by its letter on the newest card and by its id on an earlier one.
  const byLetter = (list: { id: string; letter: string }[]) => list.find((entry) => entry.id === key || entry.letter === key)!.id;
  let artifact: Record<string, unknown>;
  switch (fresh.kind) {
    case "direction":
    case "stressTest":
    case "wordmark":
    case "lockup":
      artifact = { ...set, approved: true };
      break;
    case "symbolOpener":
      artifact = { ...set, answered: "goAhead" };
      break;
    case "typeSet":
      artifact = { ...set, chosenId: byLetter(set.directions), saved: true };
      break;
    case "conceptSet":
    case "variationSet":
      artifact = { ...set, chosenId: byLetter(set.concepts) };
      break;
    case "colorwaySet":
      artifact = { ...set, chosenId: byLetter(set.colorways) };
      break;
    default:
      return;
  }
  await turn.write([{ op: "patchArtifact", messageId: fresh.id, artifact }]);
}

/**
 * Keeps what the person asked for on the cards it belongs to: how the name
 * is written on the type card, or on the wordmark card once there is one,
 * and a drawing request on the card it was said about. A typeface named while picking something else is kept for
 * the type step only if the person goes back to it.
 */
export async function keep(turn: Turn, request: Request, said: StoredMessage | null): Promise<void> {
  if (request.nameAs !== null) {
    const typeCard = turn.latest("typeSet");
    const wordmarkCard = turn.current("wordmark");
    if (stepIndex(turn.stage) <= stepIndex("type") || (wordmarkCard === null && turn.stage !== "wordmark")) {
      // Up to the type step, and on a project from before the wordmark step, the name's case lives on the type card.
      if (typeCard !== null) await turn.write([{ op: "patchArtifact", messageId: typeCard.id, artifact: { ...typeCard.artifact!, nameAs: request.nameAs, brandName: request.nameAs } }]);
    } else if (wordmarkCard !== null && turn.stage !== "wordmark") {
      // After the wordmark step, the wordmark card sets the case: the name as asked is matched to one of its three values, by equality.
      const value = (["asTyped", "allCaps", "lowercase"] as const).find((entry) => inCase(turn.nameAsTyped, entry) === request.nameAs);
      if (value !== undefined) await turn.write([{ op: "patchArtifact", messageId: wordmarkCard.id, artifact: { ...wordmarkCard.artifact!, brandName: request.nameAs, case: value } }]);
    }
    // At the wordmark step itself the step reads the case from the message (settings.ts).
  }
  if (request.drawing !== null && said !== null) {
    const card = turn.state.messages.find((message) => message.id === said.id)!;
    const requests = [...((card.artifact!.requests as string[] | undefined) ?? []), request.drawing];
    await turn.write([{ op: "patchArtifact", messageId: card.id, artifact: { ...card.artifact!, requests } }]);
  }
}

/** What a step's card looks like with nothing chosen. */
function cleared(kind: string, artifact: Record<string, any>): Record<string, unknown> {
  switch (kind) {
    case "direction":
    case "stressTest":
    case "wordmark":
    case "lockup":
      return { ...artifact, approved: false };
    case "symbolOpener":
      return { ...artifact, answered: null };
    case "typeSet":
      return { ...artifact, chosenId: null, saved: false };
    case "colorPicker":
      return { ...artifact, saved: false };
    case "variationSet": {
      // Back at the variations, the next redraw starts from the variation that was picked, the last mark picked in this step.
      const picked = artifact.concepts?.find((concept: { id: string }) => concept.id === artifact.chosenId);
      const startedFrom = picked === undefined ? (artifact.startedFrom ?? null) : { id: picked.id, name: picked.name, markFileId: picked.markFileId, sourceFileId: picked.sourceFileId };
      return { ...artifact, chosenId: null, startedFrom };
    }
    case "conceptSet":
    case "colorwaySet":
      return { ...artifact, chosenId: null };
    default:
      return { ...artifact };
  }
}

/**
 * Goes back to an earlier step. With a request, the step does its work
 * again with it; without one, a new card for the step goes in the
 * conversation with the same options and nothing chosen. Either way every
 * later card is now history: it stays where it is and no step reads it as
 * the current choice.
 */
export async function goBack(turn: Turn, to: Stage, request: Request | null): Promise<void> {
  const step = STEPS[stepIndex(to)]!;

  // The kit has no options; going back to it builds it again.
  if (to === "kit") {
    await turn.write([{ op: "project", stage: "kit" }]);
    return;
  }

  if (asksForSomething(request)) {
    // How the name is written stays on the type card; the step's new card carries the drawing request.
    await keep(turn, { ...request, drawing: null }, null);
    await turn.write([{ op: "project", stage: to }]);
    // The brief reads the message itself; every other step is told to do its work again.
    if (to !== "brief") turn.steer({ act: "redo", request });
    return;
  }

  const kind = cardKind(to)!;
  const card = turn.latest(kind);
  if (card === null || card.artifact === null) {
    turn.steer({ act: "ask" });
    return;
  }
  const line = await turn.compose(
    () =>
      turn.think<{ say: string }>({
        section: "conversation",
        task:
          to === "brief"
            ? "The person asked to start over. You are back at the brief: say so in one sentence, and ask what should change."
            : to === "symbolOpener"
              ? "You went back to the question of what the symbol should show, as the person asked. Say so in one sentence, and ask what they are picturing, or whether you should go ahead and draw three."
              : `You went back to ${step.name}, as the person asked. Say so in one sentence, and ask them to choose again.`,
        facts: { step: to },
        shape: { type: "OBJECT", properties: { say: { type: "STRING" } }, required: ["say"] },
      }),
    (value) => ({ line: value.say }),
  );
  await turn.write([
    { op: "artifact", kind, artifact: { ...cleared(kind, card.artifact), ...(line !== null ? { say: line.say } : {}) } },
    { op: "project", stage: to },
  ]);
}
