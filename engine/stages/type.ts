/**
 * Phase 2, type. Three typefaces for the brand name, chosen only from
 * Google's own classes and mood scores.
 *
 * Jev picks the classes that fit the brief and scores how much the brand
 * wants each of Google's moods. Code then ranks every family in each class
 * by those scores. The model writes only the words.
 */
import { classLabel, fontData, rank, topMoods, type Family } from "../fonts.ts";
import type { Shape } from "../gemini.ts";
import { ask, SURE, type Choice, type Score } from "../jev.ts";
import { WORKING } from "../lines.ts";
import { optionId, type Outcome, type Turn } from "../turn.ts";
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

async function propose(turn: Turn): Promise<Outcome> {
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
  const picks = topClasses.map((typeClass) => {
    const family = rank(data, typeClass, moodWeights).find((candidate) => !used.has(candidate.family))!;
    used.add(family.family);
    return { typeClass, family };
  });
  // "My pick" only when Jev is sure of its first class; otherwise the cards themselves are the question.
  const galaIsSure = classes.typeClass.confidence >= SURE;

  const words = await turn.compose(
    () =>
      turn.think<{ say: string; reasons: string[] }>({
        section: "type",
        task: "Introduce the three typefaces and give the reason for each.",
        facts: {
          ...state,
          typefaces: picks.map((pick, index) => ({ letter: LETTERS[index], family: pick.family.family, class: pick.typeClass, moods: topMoods(pick.family) })),
          myPick: galaIsSure ? "A" : null,
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
        brandName: turn.brand,
        directions: picks.map((pick, index) => ({
          id: optionId(),
          letter: LETTERS[index],
          family: pick.family.family,
          category: classLabel(pick.typeClass),
          moods: topMoods(pick.family),
          rationale: words.reasons[index] ?? "",
          pick: index === 0 && galaIsSure ? "gala" : null,
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

/** The Google family named in a message, if there is one: the longest family name that appears in it as whole words. */
async function namedFamily(message: string): Promise<{ family: string; typeClass: string; entry: Family } | null> {
  const data = await fontData();
  const text = ` ${message.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const match = data.families
    .filter((family) => text.includes(` ${family.family.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `))
    .sort((a, b) => b.family.length - a.family.length)[0];
  if (match === undefined) return null;
  const typeClass = Object.entries(match.classes).sort((a, b) => b[1] - a[1])[0]?.[0];
  return typeClass === undefined ? null : { family: match.family, typeClass, entry: match };
}

export async function type(turn: Turn): Promise<Outcome> {
  const card = turn.latest("typeSet");
  if (card === null) return propose(turn);
  const set = card.artifact!;

  if (set.saved === true && set.chosenId !== null) {
    await turn.write([
      { op: "choice", step: "type", chosen: set.chosenId, discarded: set.directions.filter((entry: { id: string }) => entry.id !== set.chosenId).map((entry: { id: string }) => entry.id) },
      { op: "project", stage: "directions" },
    ]);
    return "continue";
  }

  // The person wrote instead of pressing Choose: "Go with B".
  const said = turn.unansweredText();
  if (said === "") return "wait";
  const options = Object.fromEntries(set.directions.map((entry: { letter: string; family: string }) => [entry.letter, `The person chooses typeface ${entry.letter}, ${entry.family}`]));
  const meaning = await turn.intent(said, { ...options, named: "The person names another typeface they want", other: "The person is asking or saying something else" });
  const chosen = set.directions.find((entry: { letter: string }) => entry.letter === meaning);
  if (chosen !== undefined) {
    await turn.write([{ op: "patchArtifact", messageId: card.id, artifact: { ...set, chosenId: chosen.id, saved: true } }]);
    return "continue";
  }
  if (meaning === "named") {
    // "Or name a font you like": if Google has a family by that name, it takes the last card and is chosen.
    const named = await namedFamily(said);
    if (named !== null) {
      const last = set.directions[set.directions.length - 1];
      const directions = set.directions.map((entry: { id: string }) =>
        entry.id === last.id ? { ...entry, family: named.family, category: classLabel(named.typeClass), moods: topMoods(named.entry), rationale: "", pick: "person" } : entry,
      );
      await turn.write([{ op: "patchArtifact", messageId: card.id, artifact: { ...set, directions, chosenId: last.id, saved: true } }]);
      return "continue";
    }
  }
  await turn.converse("the person to choose one of the three typefaces, or change one in the type tray");
  return "wait";
}

/** The chosen typeface's family. */
export function familyOf(turn: Turn): string {
  const set = turn.latest("typeSet")?.artifact;
  const chosen = set?.directions.find((entry: { id: string }) => entry.id === set.chosenId);
  if (chosen === undefined) throw new Error("No typeface has been chosen.");
  return chosen.family;
}
