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
import { ask } from "./jev.ts";
import { inCase } from "./settings.ts";
import { earlierSteps, laterSteps, STEPS, stepIndex, SYMBOL_STEPS, type Step } from "./steps.ts";
import type { Stage, StoredMessage } from "./store.ts";
import type { Request, Steering, Turn } from "./turn.ts";

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
export function optionsOnScreen(turn: Turn): { card: StoredMessage; options: Option[]; signOff: boolean } | null {
  const found = optionsOf(turn);
  return found === null ? null : { ...found, signOff: SIGN_OFF_CARDS.includes(found.card.kind) };
}

function optionsOf(turn: Turn): { card: StoredMessage; options: Option[] } | null {
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

export type Reading = { pick: number | null; back: number; change: number; later: number | null; noSymbol: number | null };

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
  pick: "Does `message` pick one of the options in `optionsOnScreen`: choosing it, approving it, or saying to go with it?",
  signOff: "Does `message` tell Gala to go ahead with the option in `optionsOnScreen`: approving it, or saying to use it and move on? A compliment or a comment alone is not an approval.",
  back: "Does `message` ask to go back to one of the steps in `earlierSteps`, or to start over?",
  change: "Does `message` ask for something specific in the work to be changed or tried: the drawing, the typeface, how the name is written, or the direction?",
  idea: "Does `message` describe what the symbol should show or look like?",
  later: "Does `message` ask for something that belongs to the work of one of the steps in `laterSteps`, and not to `currentStep`?",
  noSymbol: "Does `message` explicitly ask for a logo with no symbol at all, only the name?",
} as const;

export async function read(turn: Turn, message: string, options: Option[], signOff = false): Promise<Reading> {
  const step = STEPS[stepIndex(turn.stage)]!;
  const earlier = earlierSteps(turn.stage).map((entry) => entry.name);
  const later = laterSteps(turn.stage).map((entry) => entry.name);
  const answers = (await ask({
    state: { message, currentStep: step.name, optionsOnScreen: options.map((option) => option.label), earlierSteps: earlier, laterSteps: later },
    questions: {
      ...(options.length > 0 ? { pick: { type: "noul", instructions: signOff ? ASKS.signOff : ASKS.pick } as const } : {}),
      back: { type: "noul", instructions: ASKS.back },
      change: { type: "noul", instructions: turn.stage === "symbolOpener" ? ASKS.idea : ASKS.change },
      ...(later.length > 0 ? { later: { type: "noul", instructions: ASKS.later } as const } : {}),
      ...(turn.stage === "symbolOpener" ? { noSymbol: { type: "noul", instructions: ASKS.noSymbol } as const } : {}),
    },
    signal: turn.signal,
  })) as Record<string, { noul: number } | undefined>;
  return { pick: answers.pick?.noul ?? null, back: answers.back!.noul, change: answers.change!.noul, later: answers.later?.noul ?? null, noSymbol: answers.noSymbol?.noul ?? null };
}

export function describeReading(stage: Stage, reading: Reading): string {
  const score = (value: number | null) => (value === null ? "none" : value.toFixed(2));
  const extra = reading.noSymbol === null ? "" : `, no symbol ${score(reading.noSymbol)}`;
  return `Steering at ${stage}: pick ${score(reading.pick)}, back ${score(reading.back)}, change ${score(reading.change)}, later ${score(reading.later)}${extra}`;
}

type Details = { option: string; backTo: string; laterStep?: string; laterIdea?: string | null; typeface: string | null; nameAs: string | null; drawing: string | null; note: string | null };

function detailsShape(options: Option[], earlier: Step[], later: Step[]): Shape {
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
      typeface: nullable("The typeface family the person names for the brand name, as they wrote it, or null"),
      nameAs: nullable("How the person wants the brand name written, spelled out exactly as it should appear (for example in all capitals), or null"),
      drawing: nullable("What the person asks to change or try in the drawing of the mark, in their own words, or null"),
      note: nullable("Any other change the person asks for, in their own words, or null"),
    },
    required: ["option", "backTo", ...(later.length > 0 ? ["laterStep", "laterIdea"] : []), "typeface", "nameAs", "drawing", "note"],
  };
}

/** The details, filled in by the conversation model only. */
async function details(turn: Turn, options: Option[], earlier: Step[], later: Step[]): Promise<Details> {
  return turn.think<Details>({
    section: "conversation",
    task: "Read the person's last message and fill in only what it says. Leave everything it does not say as none or null. Say nothing to the person.",
    facts: {
      brand: turn.brand,
      currentStep: STEPS[stepIndex(turn.stage)]!.name,
      optionsOnScreen: options,
      earlierSteps: earlier.map((step) => ({ key: step.stage, name: step.name })),
      ...(later.length > 0 ? { laterSteps: later.map((step) => ({ key: step.stage, name: step.name })) } : {}),
    },
    shape: detailsShape(options, earlier, later),
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
  turn.said = message;
  if (message === "") return;

  const onScreen = optionsOnScreen(turn);
  const choices = onScreen?.options ?? [];
  const reading = await read(turn, message, choices, onScreen?.signOff ?? false);
  console.log(describeReading(turn.stage, reading));

  const verdict = (score: number | null): Verdict => (score === null ? "no" : verdictOf(score));
  const back = verdict(reading.back);
  const pick = verdict(reading.pick);
  const later = verdict(reading.later);
  const noSymbol = verdict(reading.noSymbol);
  const change = verdict(reading.change);

  // A logo with no symbol: only on a clear yes. An unsure answer gets one question.
  if (back !== "yes" && noSymbol !== "no") {
    return turn.steer(noSymbol === "yes" ? { act: "noSymbol" } : { act: "ask", facts: { askWhether: "the person wants a logo with no symbol at all, only the name" } });
  }

  // A yes acts, in the order go back, pick, change. Unsure asks only when nothing is a yes.
  const decides = back === "yes" ? { move: "back" } : pick === "yes" ? { move: "pick" } : change === "yes" ? { move: "change" } : null;
  if (decides === null && later !== "yes") {
    return turn.steer([back, pick, change, later].includes("unsure") ? { act: "ask" } : { act: "talk" });
  }

  const earlier = earlierSteps(turn.stage);
  const after = laterSteps(turn.stage);
  const found = await details(turn, choices, earlier, later === "yes" ? after : []);

  // A request for a later step is stored for it and never acted on here.
  let held: { step: Stage; idea: string } | null = null;
  if (later === "yes") {
    const step = after.find((entry) => entry.stage === found.laterStep);
    const idea = found.laterIdea?.trim() ?? "";
    if (step === undefined || idea === "") {
      if (decides === null) return turn.steer({ act: "ask" });
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

  const { request, problem } = await checked(turn, found);
  if (problem !== null) {
    console.log(`Steering at ${turn.stage}: a detail did not check out (${Object.keys(problem).join(", ")})`);
    // A typeface Google doesn't have is said plainly; anything else gets one question.
    return turn.steer(problem.typefaceNotOnGoogle !== undefined ? { act: "talk", facts: problem } : { act: "ask", facts: problem });
  }
  const keptOnly: Steering | null = held === null ? null : { act: "held", step: held.step, idea: held.idea };

  if (decides?.move === "back") {
    const to = earlier.find((step) => step.stage === found.backTo);
    if (to === undefined) return turn.steer(keptOnly ?? { act: "ask" });
    const asks = change === "no" ? null : request;
    // A typeface is shown only on the type card: going back with one named lands there, whichever later step was named.
    const target = asks !== null && asks.typeface !== null && stepIndex(to.stage) > stepIndex("type") ? "type" : to.stage;
    return goBack(turn, target, asks);
  }

  if (decides?.move === "pick") {
    const option = choices.find((entry) => entry.key === found.option);
    if (option === undefined || onScreen === null) {
      console.log(`Steering at ${turn.stage}: the pick named no option on screen`);
      return turn.steer(keptOnly ?? { act: "ask" });
    }
    // A change asked for in the same message goes along with the pick.
    await keep(turn, change === "no" ? NOTHING : request, onScreen.card);
    await choose(turn, onScreen.card, option.key);
    return;
  }

  // Only a later step was asked about, or what is left for this step is nothing: the stage stays.
  if (decides === null || (held !== null && !asksForSomething(request))) return turn.steer(keptOnly ?? { act: "ask" });

  // A typeface is shown only on the type card, and the name's case only on the wordmark card: a change to either after it goes back there.
  if (request.typeface !== null && stepIndex(turn.stage) > stepIndex("type")) return goBack(turn, "type", request);
  if (request.nameAs !== null && stepIndex(turn.stage) > stepIndex("wordmark")) return goBack(turn, "wordmark", request);
  await keep(turn, { ...request, drawing: null }, null);
  return turn.steer({ act: "redo", request });
}

/** The longest request kept for a later step. */
const MAX_HELD_LENGTH = 500;

/** The same change the Choose or Approve button makes. */
async function choose(turn: Turn, card: StoredMessage, key: string): Promise<void> {
  const fresh = turn.state.messages.find((message) => message.id === card.id) ?? card;
  const set = fresh.artifact!;
  const byLetter = (list: { id: string; letter: string }[]) => list.find((entry) => entry.letter === key)!.id;
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
