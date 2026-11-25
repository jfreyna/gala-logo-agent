/**
 * Phase 2, type. Three typefaces for the brand name, chosen only from
 * Google's own classes and mood scores.
 *
 * Jev picks the classes that fit the brief and scores how much the brand
 * wants each of Google's moods. Code then ranks every family in each class
 * by those scores. The model writes only the words.
 */
import { classLabel, fontData, rank, topMoods } from "../fonts.ts";
import type { Shape } from "../gemini.ts";
import { ask, SURE, type Choice, type Score } from "../jev.ts";
import { WORKING } from "../lines.ts";
import { googleFamily } from "../steer.ts";
import { optionId, requestsOf, type Outcome, type Request, type Turn } from "../turn.ts";
import { briefOf } from "./brief.ts";
import { directionOf } from "./research.ts";

/** The rubric for "how much should the typeface feel <mood>". The score is the weight. */
const MOOD_RUBRIC = ["Not at all", "A little", "Clearly", "Strongly"];

const LETTERS = ["A", "B", "C"];

const WORDS_SHAPE: Shape = {
  type: "OBJECT",
  properties: {
    say: { type: "STRING", description: "What Gala says above the three specimen cards" },
    reasons: { type: "ARRAY", items: { type: "STRING" }, description: "One sentence per typeface, in order A, B, C, on why it fits" },
  },
  required: ["say", "reasons"],
};

/**
 * Three typefaces. A family the person named is set first, exactly as
 * named, and marked as their own pick; the other two are Gala's.
 */
async function propose(turn: Turn, request: Request | null): Promise<Outcome> {
  await turn.status(WORKING.type);
  const data = await fontData();
  const state = { brief: briefOf(turn), direction: directionOf(turn) };

  const classQuestion: Choice = {
    type: "choice",
    instructions: "Which class of typeface best fits the brand in `brief` and the direction in `direction`?",
    criteria: Object.fromEntries(data.classes.map((name) => [name, null])),
  };
  const moodQuestions = Object.fromEntries(
    data.moods.map((mood): [string, Score] => [mood, { type: "score", instructions: `How much should this brand's typeface feel ${mood.toLowerCase()}?`, criteria: MOOD_RUBRIC }]),
  );
  const [classes, moods] = await Promise.all([
    ask({ state, questions: { typeClass: classQuestion }, signal: turn.signal }),
    ask({ state, questions: moodQuestions, signal: turn.signal }),
  ]);

  const moodWeights = Object.fromEntries(Object.entries(moods).map(([mood, answer]) => [mood, answer.score]));
  // The three likeliest classes, and in each the family that fits the moods best.
  const topClasses = Object.entries(classes.typeClass.probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);
  const used = new Set<string>();
  // A family the person named now, or one they asked for before this step opened.
  const kept = turn.heldFor("type");
  const wanted = request?.typeface ?? (await Promise.all(kept.map((text) => googleFamily(text)))).find((family) => family !== null) ?? null;
  const named = wanted !== null ? data.families.find((family) => family.family === wanted) : undefined;
  const picks: { typeClass: string; family: (typeof data.families)[number]; person: boolean }[] = [];
  if (named !== undefined) {
    const typeClass = Object.entries(named.classes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? topClasses[0]!;
    picks.push({ typeClass, family: named, person: true });
    used.add(named.family);
  }
  for (const typeClass of topClasses) {
    if (picks.length >= 3) break;
    const family = rank(data, typeClass, moodWeights).find((candidate) => !used.has(candidate.family))!;
    used.add(family.family);
    picks.push({ typeClass, family, person: false });
  }
  // "My pick" only when Jev is sure of its first class and the person named none; otherwise the cards themselves are the question.
  const galaIsSure = named === undefined && classes.typeClass.confidence >= SURE;
  // How the name is set: as the person asked now, or as they asked before.
  const nameAs = request?.nameAs ?? turn.nameAsTyped;

  const words = await turn.compose(
    () =>
      turn.think<{ say: string; reasons: string[] }>({
        section: "type",
        task: "Introduce the three typefaces and give the reason for each.",
        facts: {
          ...state,
          typefaces: picks.map((pick, index) => ({ letter: LETTERS[index], family: pick.family.family, class: pick.typeClass, moods: topMoods(pick.family) })),
          myPick: galaIsSure ? "A" : null,
          thePersonsOwnPick: named !== undefined ? "A" : null,
          nameIsWritten: nameAs,
          whatThePersonAskedForEarlier: kept.length > 0 ? kept : null,
        },
        shape: WORDS_SHAPE,
      }),
    (value) => ({ line: value.say, card: value.reasons }),
  );
  if (words === null) {
    await turn.decline();
    return "wait";
  }

  await turn.write([
    {
      op: "artifact",
      kind: "typeSet",
      artifact: {
        say: words.say,
        brandName: nameAs,
        ...(nameAs !== turn.brand ? { nameAs } : {}),
        ...requestsOf(request),
        directions: picks.map((pick, index) => ({
          id: optionId(),
          letter: LETTERS[index],
          family: pick.family.family,
          category: classLabel(pick.typeClass),
          moods: topMoods(pick.family),
          rationale: words.reasons[index] ?? "",
          pick: pick.person ? "person" : index === 0 && galaIsSure ? "gala" : null,
        })),
        chosenId: null,
        saved: false,
        // What the type tray sorts by, so the browser ranks families the way Gala did.
        moodWeights,
      },
    },
  ]);
  return "wait";
}

export async function type(turn: Turn): Promise<Outcome> {
  const next = turn.take();
  // A typeface named, how the name is written, or new ones asked for: three again.
  if (next?.act === "redo") return propose(turn, next.request);
  const card = turn.current("typeSet");
  if (card === null) return propose(turn, null);
  const set = card.artifact!;

  // The typeface is chosen: the next step shows the name set in it, and waits for its own sign-off.
  if (set.saved === true && set.chosenId !== null) {
    await turn.write([
      { op: "choice", step: "type", chosen: set.chosenId, discarded: set.directions.filter((entry: { id: string }) => entry.id !== set.chosenId).map((entry: { id: string }) => entry.id) },
      { op: "project", stage: "wordmark" },
    ]);
    return "continue";
  }

  if (next !== null) await turn.answer(next, "the person to choose one of the three typefaces, or change one in the type tray");
  return "wait";
}

/** The chosen typeface's family. */
export function familyOf(turn: Turn): string {
  const set = turn.latest("typeSet")?.artifact;
  const chosen = set?.directions.find((entry: { id: string }) => entry.id === set.chosenId);
  if (chosen === undefined) throw new Error("No typeface has been chosen.");
  return chosen.family;
}
