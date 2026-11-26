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
import { cannotDrawLine, NO_TYPEFACE_LINE, WORKING } from "../lines.ts";
import { NOTICE_KIND, noticeFor } from "../notice.ts";
import { googleFamily } from "../steer.ts";
import { keptCard, optionId, requestsOf, type Outcome, type Request, type Turn } from "../turn.ts";
import { CannotSet } from "../../kit/src/font.ts";
import { namesToSet, settablePicks, whyNot } from "../typeset.ts";
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
  // Every class, likeliest first. The first three give the three typefaces, unless one has no family that can draw the name.
  const byLikelihood = Object.entries(classes.typeClass.probabilities)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  // A family the person named now, or one they asked for before this step opened.
  const kept = turn.heldFor("type");
  const wanted = request?.typeface ?? (await Promise.all(kept.map((text) => googleFamily(text)))).find((family) => family !== null) ?? null;
  const namedFamily = wanted !== null ? data.families.find((family) => family.family === wanted) : undefined;
  // How the name is set: as the person asked now, or as they asked before.
  const nameAs = request?.nameAs ?? turn.nameAsTyped;
  // Each typeface is checked by setting the name in it before it is offered (typeset.ts): a family that
  // can't draw the name is passed over for the next-ranked one in its class.
  const { picks, refused, skipped } = await settablePicks({
    classes: byLikelihood,
    ranked: (typeClass) => rank(data, typeClass, moodWeights),
    named: namedFamily === undefined ? undefined : { typeClass: Object.entries(namedFamily.classes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? byLikelihood[0]!, family: namedFamily },
    names: namesToSet(nameAs),
    count: LETTERS.length,
  });
  if (skipped.length > 0 || refused !== null) console.log(`Type: passed over ${skipped.length + (refused !== null ? 1 : 0)} typeface(s) that can't draw the name`);
  if (picks.length === 0) {
    await turn.write([{ op: "say", text: refused !== null ? cannotDrawLine(nameAs, refused, true) : NO_TYPEFACE_LINE }]);
    return "wait";
  }
  const named = picks[0]!.person ? picks[0]!.family : undefined;
  // "My pick" only when Jev is sure of its first class and the person named none; otherwise the cards themselves are the question.
  const galaIsSure = named === undefined && classes.typeClass.confidence >= SURE;

  const wordsChecked = await turn.composeCard(
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
          typefaceThePersonAskedForThatCannotDrawTheName: refused === null ? null : { family: refused.family, lettersItLacks: refused.letters.length > 0 ? refused.letters : null },
        },
        shape: WORDS_SHAPE,
      }),
    (value) => ({ line: value.say, card: value.reasons }),
  );
  if (wordsChecked === null) {
    await turn.decline();
    return "wait";
  }
  const words = keptCard(wordsChecked, turn.stage);

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
    // The pick is checked by setting the name in it, whichever way it was made: a specimen, or a family
    // from the type tray, which Gala never offered. One that can't draw the name is un-picked, and Gala says why.
    const family = familyOf(turn);
    const verdict = await whyNot(family, namesToSet(turn.nameAsTyped));
    if (verdict instanceof CannotSet) {
      console.log(`Type: the chosen typeface can't draw the name (${verdict.why})`);
      const previous = turn.state.messages.findLast((message) => message.author === "gala") ?? null;
      await turn.write([
        { op: "patchArtifact", messageId: card.id, artifact: { ...set, chosenId: null, saved: false } },
        { op: "artifact", kind: NOTICE_KIND, artifact: noticeFor(verdict, "type", turn.nameAsTyped, previous) },
      ]);
      return "wait";
    }
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
