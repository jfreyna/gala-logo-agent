/**
 * Phase 3, three directions in black and white, and then three variations
 * of the one the person picks. Both steps draw three, check each, and wait
 * for a pick; they differ in what the drawing starts from.
 */
import { badges, draftThree, findings, type Idea } from "../drafting.ts";
import type { Image, Shape } from "../gemini.ts";
import { pickedEarlierLine, WORKING } from "../lines.ts";
import { isMarkRef, pickedRound, placeOf, roundsOf, type RoundKind } from "../rounds.ts";
import { SYMBOL_STEPS } from "../steps.ts";
import type { Stage, StoredMessage } from "../store.ts";
import { asked, requestsOf, type MarkRef, type Outcome, type Request, type Turn } from "../turn.ts";
import { briefOf } from "./brief.ts";
import { competitorImages, competitorsOf, directionOf } from "./research.ts";
import { familyOf } from "./type.ts";

const IDEAS_SHAPE: Shape = {
  type: "OBJECT",
  properties: {
    concepts: {
      type: "ARRAY",
      description: "Exactly three",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "A one or two word name for the idea" },
          idea: { type: "STRING", description: "The idea in one sentence" },
          prompt: { type: "STRING", description: "The prompt for the image model" },
        },
        required: ["name", "idea", "prompt"],
      },
    },
  },
  required: ["concepts"],
};

const WORDS_SHAPE: Shape = {
  type: "OBJECT",
  properties: {
    say: { type: "STRING", description: "What Gala says above the three cards" },
    rationales: { type: "ARRAY", items: { type: "STRING" }, description: "One sentence per card, in order" },
  },
  required: ["say", "rationales"],
};

type Round = {
  /** The card this round writes. */
  kind: "conceptSet" | "variationSet";
  section: "directions" | "variations";
  step: Stage;
  next: Stage;
  letters: string[];
  working: string;
  task: string;
  /** The mark the drawing starts from; none for the first directions. */
  from?: Image;
  /** That mark, named for the model and recorded on the card, so the next round can start from it too. */
  startedFrom?: MarkRef | null;
  /** What the person asked for just now, when the round is drawn again at their word. */
  request: Request | null;
};

/**
 * Said to the model with every drawing, because the person can ask for it:
 * the name is set in type by code beside the mark, and a mark with
 * lettering is set aside (marks.ts).
 */
const LETTERING = "The mark never contains letters: the name is set in type beside it, and a mark with lettering is set aside. If the person asked for something drawn inside or in place of a letter, carry the idea into the mark's shape, and say plainly that you can't draw inside the letters and what you did instead.";

/**
 * Every request still standing, and what was just asked; each goes to
 * every drawing until the mark is approved. What the person asked for
 * ahead of the symbol steps, and at the symbol opener, is among them.
 */
export function standingRequests(turn: Turn, request: Request | null): string[] {
  return [...new Set([...turn.heldFor(...SYMBOL_STEPS), ...turn.drawingRequests(), ...(asked(request) ?? [])])];
}

/** Draws three, has Gala write about them, and shows the card. */
async function drawRound(turn: Turn, round: Round): Promise<Outcome> {
  await turn.status(round.working);
  const context = { direction: directionOf(turn), competitors: competitorsOf(turn) };
  // The competitors' own site icons go to the "distinct" check as images; the log carries the count, never the images.
  const competitorImageList = await competitorImages(turn);
  console.log(`Distinct check: ${competitorImageList.length} competitor image(s)`);
  const standing = standingRequests(turn, round.request);
  const wanted = standing.length > 0 ? standing : null;
  const earlier = turn.state.messages
    .filter((message) => message.kind === round.kind)
    .flatMap((message) => message.artifact!.concepts.map((concept: { name: string }) => concept.name));

  const { concepts } = await turn.think<{ concepts: Idea[] }>({
    section: round.section,
    task: round.task,
    facts: { brief: briefOf(turn), ...context, typeface: familyOf(turn), nameIsWritten: turn.nameAsSet, startingFrom: round.startedFrom?.name ?? null, alreadyShown: earlier, whatThePersonAskedFor: wanted, aboutLetters: LETTERING },
    shape: IDEAS_SHAPE,
  });
  const { drafts, setAside } = await draftThree(turn, concepts, { ...context, competitorImages: competitorImageList }, round.from);

  const words = await turn.compose(
    () =>
      turn.think<{ say: string; rationales: string[] }>({
        section: round.section,
        task: "The three are drawn and checked. Introduce them and give one sentence for each, true to the check results.",
        facts: { drawn: findings(drafts, round.letters), setAside: setAside.map((entry) => entry.reason), whatThePersonAskedFor: wanted, startingFrom: round.startedFrom?.name ?? null, aboutLetters: LETTERING },
        shape: WORDS_SHAPE,
      }),
    (value) => ({ line: value.say, card: [...value.rationales, ...drafts.map((draft) => draft.name)] }),
  );
  if (words === null) {
    await turn.decline();
    return "wait";
  }

  await turn.write([
    {
      op: "artifact",
      kind: round.kind,
      ref: "set",
      artifact: {
        say: words.say,
        concepts: drafts.map((draft, index) => ({
          id: draft.id,
          letter: round.letters[index],
          name: draft.name,
          rationale: words.rationales[index] ?? "",
          markFileId: draft.markFileId,
          sourceFileId: draft.sourceFileId,
          checks: badges(draft.judgement),
        })),
        ...(round.kind === "conceptSet" ? { discarded: setAside } : { setAside }),
        chosenId: null,
        startedFrom: round.startedFrom ?? null,
        ...requestsOf(round.request),
      },
    },
    { op: "choice", step: round.step, discarded: setAside.map((entry) => entry.id), messageRef: "set" },
    { op: "project", latestMarkFileId: drafts[0]!.markFileId },
  ]);
  return "wait";
}

/**
 * Gala's line when the pick came from an earlier round: the mark, and the
 * round it was on. Written by the model from those two facts; the fixed
 * line says the same when no checked line comes back.
 */
export async function broughtBackLine(turn: Turn, section: string, name: string, rounds: StoredMessage[], card: StoredMessage): Promise<string> {
  const place = placeOf(rounds, card);
  const line = await turn.compose(
    () =>
      turn.think<{ say: string }>({
        section,
        task: "The person picked from an earlier round of this step, not the newest one. Say in one short sentence that you are going on with it, naming it and the round it came from.",
        facts: { pickedFromEarlierRound: name, round: place },
        shape: { type: "OBJECT", properties: { say: { type: "STRING" } }, required: ["say"] },
      }),
    (value) => ({ line: value.say }),
  );
  return line?.say ?? pickedEarlierLine(name, place.roundsAfterIt);
}

/**
 * The person picked: record it and move on. A pick on an earlier round
 * brings that round back as the newest card, with the pick and Gala's line
 * naming the round, so every step after this one reads the newest card and
 * finds the mark that was picked.
 */
async function settle(turn: Turn, rounds: StoredMessage[], card: StoredMessage, round: Pick<Round, "kind" | "section" | "step" | "next">): Promise<Outcome> {
  const set = card.artifact!;
  const others = set.concepts.filter((concept: { id: string }) => concept.id !== set.chosenId).map((concept: { id: string }) => concept.id);
  const chosen = set.concepts.find((concept: { id: string }) => concept.id === set.chosenId);
  const newest = rounds[rounds.length - 1];
  const bringBack =
    newest !== undefined && newest.id !== card.id
      ? [{ op: "artifact" as const, kind: round.kind, artifact: { ...set, say: await broughtBackLine(turn, round.section, chosen.name, rounds, card), broughtBack: placeOf(rounds, card) } }]
      : [];
  await turn.write([
    ...bringBack,
    { op: "choice", step: round.step, chosen: set.chosenId, discarded: others },
    { op: "project", stage: round.next, latestMarkFileId: chosen.markFileId },
  ]);
  return "continue";
}

/**
 * The mark a redraw starts from: the one the request names (a mark on one
 * of the step's rounds, or the one picked with a change); else the mark
 * the step's newest round started from; else, at the variations, the
 * picked variation when the person came back from the stress test, and the
 * chosen direction otherwise. The first directions start from nothing.
 */
export function startingMark(turn: Turn, kind: Extract<RoundKind, "conceptSet" | "variationSet">, request: Request | null): MarkRef | null {
  if (isMarkRef(request?.startFrom)) return request.startFrom;
  const rounds = roundsOf(turn, kind);
  const carried = rounds[rounds.length - 1]?.artifact?.startedFrom;
  if (isMarkRef(carried)) return carried;
  if (kind === "conceptSet") return null;
  // A stress test newer than every variation means the person came back to change the picked mark.
  const back = turn.isNewer(turn.current("stressTest"), turn.latest("variationSet"));
  const { id, name, markFileId, sourceFileId } = back ? chosenConcept(turn, "variationSet") : chosenConcept(turn, "conceptSet");
  return { id, name, markFileId, sourceFileId };
}

export async function directions(turn: Turn): Promise<Outcome> {
  const next = turn.take();
  const rounds = roundsOf(turn, "conceptSet");
  if (rounds.length > 0 && next?.act !== "redo") {
    const picked = pickedRound(rounds);
    if (picked !== null) return settle(turn, rounds, picked, { kind: "conceptSet", section: "directions", step: "directions", next: "variations" });
    if (next !== null) await turn.answer(next, "the person to pick direction A, B or C, or say what to change");
    return "wait";
  }
  const request = next?.act === "redo" ? next.request : null;
  const start = startingMark(turn, "conceptSet", request);
  const source = start === null ? null : await turn.store.readFile(start.sourceFileId);
  return drawRound(turn, {
    kind: "conceptSet",
    section: "directions",
    step: "directions",
    next: "variations",
    letters: ["A", "B", "C"],
    working: WORKING.directions,
    task:
      start === null
        ? "Propose three clearly different directions for the mark."
        : "Propose three new directions that start from the mark attached to the image model's prompt, named in startingFrom, with what the person asked for.",
    ...(source !== null ? { from: { bytes: source.bytes, mime: source.contentType } } : {}),
    startedFrom: start,
    request,
  });
}

/** The mark picked at a step, with its files: on the newest card of its kind, where a pick from an earlier round is brought back. */
export function chosenConcept(turn: Turn, kind: "conceptSet" | "variationSet"): { id: string; name: string; markFileId: string; sourceFileId: string } {
  const set = turn.latest(kind)?.artifact;
  const chosen = set?.concepts.find((concept: { id: string }) => concept.id === set.chosenId);
  if (chosen === undefined) throw new Error("No mark has been chosen.");
  return chosen;
}

export async function variations(turn: Turn): Promise<Outcome> {
  const next = turn.take();
  const rounds = roundsOf(turn, "variationSet");
  if (rounds.length > 0 && next?.act !== "redo") {
    const picked = pickedRound(rounds);
    if (picked !== null) return settle(turn, rounds, picked, { kind: "variationSet", section: "variations", step: "variations", next: "stressTest" });
    if (next !== null) await turn.answer(next, "the person to pick variation 1, 2 or 3, or say what to change");
    return "wait";
  }
  const request = next?.act === "redo" ? next.request : null;
  const start = startingMark(turn, "variationSet", request)!;
  const source = await turn.store.readFile(start.sourceFileId);
  return drawRound(turn, {
    kind: "variationSet",
    section: "variations",
    step: "variations",
    next: "stressTest",
    letters: ["1", "2", "3"],
    working: WORKING.variations,
    task: "Propose three refinements of the mark attached to the image model's prompt, named in startingFrom.",
    from: { bytes: source.bytes, mime: source.contentType },
    startedFrom: start,
    request,
  });
}
