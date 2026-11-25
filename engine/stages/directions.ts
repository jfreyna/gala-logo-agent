/**
 * Phase 3, three directions in black and white, and then three variations
 * of the one the person picks. Both steps draw three, check each, and wait
 * for a pick; they differ in what the drawing starts from.
 */
import { badges, draftThree, findings, type Idea } from "../drafting.ts";
import type { Image, Shape } from "../gemini.ts";
import { WORKING } from "../lines.ts";
import type { Stage, StoredMessage } from "../store.ts";
import type { Outcome, Turn } from "../turn.ts";
import { briefOf } from "./brief.ts";
import { competitorsOf, directionOf } from "./research.ts";
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
};

/** Draws three, has Gala write about them, and shows the card. */
async function drawRound(turn: Turn, round: Round): Promise<Outcome> {
  await turn.status(round.working);
  const context = { direction: directionOf(turn), competitors: competitorsOf(turn) };
  const earlier = turn.state.messages
    .filter((message) => message.kind === round.kind)
    .flatMap((message) => message.artifact!.concepts.map((concept: { name: string }) => concept.name));

  const { concepts } = await turn.think<{ concepts: Idea[] }>({
    section: round.section,
    task: round.task,
    facts: { brief: briefOf(turn), ...context, typeface: familyOf(turn), startingFrom: round.startingFrom ?? null, alreadyShown: earlier, whatThePersonAskedFor: turn.unansweredText() || null },
    shape: IDEAS_SHAPE,
  });
  const { drafts, setAside } = await draftThree(turn, concepts, context, round.from);

  const words = await turn.compose(
    () =>
      turn.think<{ say: string; rationales: string[] }>({
        section: round.section,
        task: "The three are drawn and checked. Introduce them and give one sentence for each, true to the check results.",
        facts: { drawn: findings(drafts, round.letters), setAside: setAside.map((entry) => entry.reason) },
        shape: WORDS_SHAPE,
      }),
    (value) => [value.say, ...value.rationales, ...drafts.map((draft) => draft.name)],
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

/**
 * The person wrote instead of pressing a card: "Go with A", or what to
 * change. Returns the outcome, or "redraw" when they asked for new ones.
 */
async function readReply(turn: Turn, card: StoredMessage, waitingFor: string): Promise<Outcome | "redraw"> {
  const said = turn.unansweredText();
  if (said === "") return "wait";
  const set = card.artifact!;
  const picks = Object.fromEntries(set.concepts.map((concept: { letter: string; name: string }) => [concept.letter, `The person chooses option ${concept.letter}, ${concept.name}`]));
  const meaning = await turn.intent(said, { ...picks, redraw: "The person wants the options changed or drawn again", other: "The person is asking or saying something else" });
  const chosen = set.concepts.find((concept: { letter: string }) => concept.letter === meaning);
  if (chosen !== undefined) {
    await turn.write([{ op: "patchArtifact", messageId: card.id, artifact: { ...set, chosenId: chosen.id } }]);
    return "continue";
  }
  if (meaning === "redraw") return "redraw";
  await turn.converse(waitingFor);
  return "wait";
}

export async function directions(turn: Turn): Promise<Outcome> {
  const card = turn.latest("conceptSet");
  if (card !== null) {
    if (card.artifact!.chosenId !== null) return settle(turn, card, { step: "directions", next: "variations" });
    const reply = await readReply(turn, card, "the person to pick direction A, B or C, or say what to change");
    if (reply !== "redraw") return reply;
  }
  return drawRound(turn, {
    kind: "conceptSet",
    section: "directions",
    step: "directions",
    next: "variations",
    letters: ["A", "B", "C"],
    working: WORKING.directions,
    task: "Propose three clearly different directions for the mark.",
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
  const card = turn.latest("variationSet");
  // A stress test newer than the set means the person came back to change the mark.
  const reopened = card !== null && turn.isNewer(turn.latest("stressTest"), card);
  if (card !== null && !reopened) {
    if (card.artifact!.chosenId !== null) return settle(turn, card, { step: "variations", next: "stressTest" });
    const reply = await readReply(turn, card, "the person to pick variation 1, 2 or 3, or say what to change");
    if (reply !== "redraw") return reply;
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
  });
}
