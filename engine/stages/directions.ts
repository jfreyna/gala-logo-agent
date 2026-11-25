/**
 * Phase 3, three directions in black and white, and then three variations
 * of the one the person picks. Both steps draw three, check each, and wait
 * for a pick; they differ in what the drawing starts from.
 */
import { badges, draftThree, findings, type Idea } from "../drafting.ts";
import type { Image, Shape } from "../gemini.ts";
import { WORKING } from "../lines.ts";
import { SYMBOL_STEPS } from "../steps.ts";
import type { Stage, StoredMessage } from "../store.ts";
import { asked, requestsOf, type Outcome, type Request, type Turn } from "../turn.ts";
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
  startingFrom?: unknown;
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
    facts: { brief: briefOf(turn), ...context, typeface: familyOf(turn), nameIsWritten: turn.nameAsSet, startingFrom: round.startingFrom ?? null, alreadyShown: earlier, whatThePersonAskedFor: wanted, aboutLetters: LETTERING },
    shape: IDEAS_SHAPE,
  });
  const { drafts, setAside } = await draftThree(turn, concepts, { ...context, competitorImages: competitorImageList }, round.from);

  const words = await turn.compose(
    () =>
      turn.think<{ say: string; rationales: string[] }>({
        section: round.section,
        task: "The three are drawn and checked. Introduce them and give one sentence for each, true to the check results.",
        facts: { drawn: findings(drafts, round.letters), setAside: setAside.map((entry) => entry.reason), whatThePersonAskedFor: wanted, aboutLetters: LETTERING },
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
        ...requestsOf(round.request),
      },
    },
    { op: "choice", step: round.step, discarded: setAside.map((entry) => entry.id), messageRef: "set" },
    { op: "project", latestMarkFileId: drafts[0]!.markFileId },
  ]);
  return "wait";
}

/** The person picked: record it and move on. */
async function settle(turn: Turn, card: StoredMessage, round: Pick<Round, "step" | "next">): Promise<Outcome> {
  const set = card.artifact!;
  const others = set.concepts.filter((concept: { id: string }) => concept.id !== set.chosenId).map((concept: { id: string }) => concept.id);
  const chosen = set.concepts.find((concept: { id: string }) => concept.id === set.chosenId);
  await turn.write([
    { op: "choice", step: round.step, chosen: set.chosenId, discarded: others },
    { op: "project", stage: round.next, latestMarkFileId: chosen.markFileId },
  ]);
  return "continue";
}

export async function directions(turn: Turn): Promise<Outcome> {
  const next = turn.take();
  const card = turn.current("conceptSet");
  if (card !== null && next?.act !== "redo") {
    if (card.artifact!.chosenId !== null) return settle(turn, card, { step: "directions", next: "variations" });
    if (next !== null) await turn.answer(next, "the person to pick direction A, B or C, or say what to change");
    return "wait";
  }
  return drawRound(turn, {
    kind: "conceptSet",
    section: "directions",
    step: "directions",
    next: "variations",
    letters: ["A", "B", "C"],
    working: WORKING.directions,
    task: "Propose three clearly different directions for the mark.",
    request: next?.act === "redo" ? next.request : null,
  });
}

/** The mark picked at a step, with its files. */
export function chosenConcept(turn: Turn, kind: "conceptSet" | "variationSet"): { id: string; name: string; markFileId: string; sourceFileId: string } {
  const set = turn.latest(kind)?.artifact;
  const chosen = set?.concepts.find((concept: { id: string }) => concept.id === set.chosenId);
  if (chosen === undefined) throw new Error("No mark has been chosen.");
  return chosen;
}

export async function variations(turn: Turn): Promise<Outcome> {
  const next = turn.take();
  const card = turn.current("variationSet");
  // A stress test newer than the set means the person came back to change the mark.
  const reopened = card !== null && turn.isNewer(turn.current("stressTest"), card);
  if (card !== null && !reopened && next?.act !== "redo") {
    if (card.artifact!.chosenId !== null) return settle(turn, card, { step: "variations", next: "stressTest" });
    if (next !== null) await turn.answer(next, "the person to pick variation 1, 2 or 3, or say what to change");
    return "wait";
  }
  const start = reopened ? chosenConcept(turn, "variationSet") : chosenConcept(turn, "conceptSet");
  const source = await turn.store.readFile(start.sourceFileId);
  return drawRound(turn, {
    kind: "variationSet",
    section: "variations",
    step: "variations",
    next: "stressTest",
    letters: ["1", "2", "3"],
    working: WORKING.variations,
    task: "Propose three refinements of the chosen mark, which is attached to the image model's prompt.",
    from: { bytes: source.bytes, mime: source.contentType },
    startingFrom: { name: start.name },
    request: next?.act === "redo" ? next.request : null,
  });
}
