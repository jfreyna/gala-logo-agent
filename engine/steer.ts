/**
 * Steering: what the person's message asks Gala to do with the work.
 *
 * Every message after the brief is read once, here, before the step runs.
 * During the brief every message is an answer, so it is not read.
 *
 *   1. Jev answers three yes or no questions in one call: does the message
 *      pick one of the options on screen, does it ask to go back to an
 *      earlier step or start over, and does it ask for a change. More than
 *      one can be yes. Each score is yes, no or unsure; unsure is a band
 *      around the middle, the same for all three.
 *   2. Only when something is yes does the conversation model fill in the
 *      details: which option, which step, which typeface, how the name is
 *      written, what to change in the drawing. Code checks each one against
 *      what is real before using it.
 *   3. Code moves the stage. When several are yes, in this order: go back,
 *      pick, change. When none is yes but one is unsure, or a detail does
 *      not check out, Gala asks one short question and nothing moves. When
 *      all three are no, Gala answers in words.
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
import { ask } from "./jev.ts";
import { earlierSteps, STEPS, stepIndex, type Step } from "./steps.ts";
import type { Stage, StoredMessage } from "./store.ts";
import type { Request, Turn } from "./turn.ts";

/**
 * Half the width of the unsure band around 0.5. One number for all three
 * questions, not fitted to any message: at or above 0.7 is yes, at or
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

/** The steps with no options of their own: a person acts on their cards, or there is nothing left to choose. */
const NO_OPTIONS: Stage[] = ["brief", "pickColors", "kit", "picks", "done"];

/** The card a step shows, the one a request said at that step is written onto. */
function cardKind(stage: Stage): string | null {
  if (stage === "research") return "direction";
  return STEPS[stepIndex(stage)]?.kinds[0] ?? null;
}

/** The options on screen at the current step, from its current card. None once one is chosen. */
export function optionsOnScreen(turn: Turn): { card: StoredMessage; options: Option[] } | null {
  if (NO_OPTIONS.includes(turn.stage)) return null;
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

export type Reading = { pick: number | null; back: number; change: number };

/** Jev's three answers. `pick` is null when the step has no options. */
export async function read(turn: Turn, message: string, options: Option[]): Promise<Reading> {
  const step = STEPS[stepIndex(turn.stage)]!;
  const earlier = earlierSteps(turn.stage).map((entry) => entry.name);
  const answers = await ask({
    state: { message, currentStep: step.name, optionsOnScreen: options.map((option) => option.label), earlierSteps: earlier },
    questions: {
      ...(options.length > 0
        ? { pick: { type: "noul", instructions: "Does `message` pick one of the options in `optionsOnScreen`: choosing it, approving it, or saying to go with it?" } as const }
        : {}),
      back: { type: "noul", instructions: "Does `message` ask to go back to one of the steps in `earlierSteps`, or to start over?" },
      change: { type: "noul", instructions: "Does `message` ask for something specific in the work to be changed or tried: the drawing, the typeface, how the name is written, or the direction?" },
    },
    signal: turn.signal,
  });
  return { pick: "pick" in answers ? (answers as { pick: { noul: number } }).pick.noul : null, back: answers.back.noul, change: answers.change.noul };
}

export function describeReading(stage: Stage, reading: Reading): string {
  const score = (value: number | null) => (value === null ? "none" : value.toFixed(2));
  return `Steering at ${stage}: pick ${score(reading.pick)}, back ${score(reading.back)}, change ${score(reading.change)}`;
}

type Details = { option: string; backTo: string; typeface: string | null; nameAs: string | null; drawing: string | null; note: string | null };

function detailsShape(options: Option[], earlier: Step[]): Shape {
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
      typeface: nullable("The typeface family the person names for the brand name, as they wrote it, or null"),
      nameAs: nullable("How the person wants the brand name written, spelled out exactly as it should appear (for example in all capitals), or null"),
      drawing: nullable("What the person asks to change or try in the drawing of the mark, in their own words, or null"),
      note: nullable("Any other change the person asks for, in their own words, or null"),
    },
    required: ["option", "backTo", "typeface", "nameAs", "drawing", "note"],
  };
}

/** The details, filled in by the conversation model only. */
async function details(turn: Turn, options: Option[], earlier: Step[]): Promise<Details> {
  return turn.think<Details>({
    section: "conversation",
    task: "Read the person's last message and fill in only what it says. Leave everything it does not say as none or null. Say nothing to the person.",
    facts: {
      brand: turn.brand,
      currentStep: STEPS[stepIndex(turn.stage)]!.name,
      optionsOnScreen: options,
      earlierSteps: earlier.map((step) => ({ key: step.stage, name: step.name })),
    },
    shape: detailsShape(options, earlier),
  });
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
  return request !== null && (request.typeface !== null || request.nameAs !== null || request.drawing !== null || request.note !== null);
}

/** The details checked against what is real. A detail that doesn't check out is named in `problem`. */
async function checked(turn: Turn, found: Details): Promise<{ request: Request; problem: Record<string, unknown> | null }> {
  const request: Request = { ...NOTHING, drawing: found.drawing?.trim() || null, note: found.note?.trim() || null };
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
  if (message === "") return;

  const onScreen = optionsOnScreen(turn);
  const choices = onScreen?.options ?? [];
  const reading = await read(turn, message, choices);
  console.log(describeReading(turn.stage, reading));

  const back = verdictOf(reading.back);
  const pick = reading.pick === null ? "no" : verdictOf(reading.pick);
  const change = verdictOf(reading.change);

  // A yes acts, in the order go back, pick, change. Unsure asks only when nothing is a yes.
  const decides = back === "yes" ? { move: "back" } : pick === "yes" ? { move: "pick" } : change === "yes" ? { move: "change" } : null;
  if (decides === null) return turn.steer(back === "unsure" || pick === "unsure" || change === "unsure" ? { act: "ask" } : { act: "talk" });

  const earlier = earlierSteps(turn.stage);
  const found = await details(turn, choices, earlier);
  const { request, problem } = await checked(turn, found);
  if (problem !== null) {
    // A typeface Google doesn't have is said plainly; anything else gets one question.
    return turn.steer(problem.typefaceNotOnGoogle !== undefined ? { act: "talk", facts: problem } : { act: "ask", facts: problem });
  }

  if (decides.move === "back") {
    const to = earlier.find((step) => step.stage === found.backTo);
    if (to === undefined) return turn.steer({ act: "ask" });
    return goBack(turn, to.stage, change === "no" ? null : request);
  }

  if (decides.move === "pick") {
    const option = choices.find((entry) => entry.key === found.option);
    if (option === undefined || onScreen === null) return turn.steer({ act: "ask" });
    // A change asked for in the same message goes along with the pick.
    await keep(turn, change === "no" ? NOTHING : request, onScreen.card);
    await choose(turn, onScreen.card, option.key);
    return;
  }

  // A typeface, or how the name is written, is shown only on the type card: a change to either after it goes back there.
  if ((request.typeface !== null || request.nameAs !== null) && stepIndex(turn.stage) > stepIndex("type")) return goBack(turn, "type", request);
  await keep(turn, { ...request, drawing: null }, null);
  return turn.steer({ act: "redo", request });
}

/** The same change the Choose or Approve button makes. */
async function choose(turn: Turn, card: StoredMessage, key: string): Promise<void> {
  const fresh = turn.state.messages.find((message) => message.id === card.id) ?? card;
  const set = fresh.artifact!;
  const byLetter = (list: { id: string; letter: string }[]) => list.find((entry) => entry.letter === key)!.id;
  let artifact: Record<string, unknown>;
  switch (fresh.kind) {
    case "direction":
    case "stressTest":
      artifact = { ...set, approved: true };
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
 * is written on the type card, and a drawing request on the card it was
 * said about. A typeface named while picking something else is kept for
 * the type step only if the person goes back to it.
 */
export async function keep(turn: Turn, request: Request, said: StoredMessage | null): Promise<void> {
  const typeCard = turn.latest("typeSet");
  if (request.nameAs !== null && typeCard !== null) {
    await turn.write([{ op: "patchArtifact", messageId: typeCard.id, artifact: { ...typeCard.artifact!, nameAs: request.nameAs, brandName: request.nameAs } }]);
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
      return { ...artifact, approved: false };
    case "typeSet":
      return { ...artifact, chosenId: null, saved: false };
    case "colorPicker":
      return { ...artifact, saved: false };
    case "conceptSet":
    case "variationSet":
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
