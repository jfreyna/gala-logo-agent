/**
 * Phase 4, color. The person picks their own colors; Gala applies them
 * three ways. Colors are named by role in the chat, never by hex, and
 * anything Gala says about contrast is checked against numbers computed in
 * code before it shows.
 */
import { colorwayOptions, hexOf, roleName, type BrandColors, type ColorwayOption } from "../colorways.ts";
import type { Shape } from "../gemini.ts";
import { mentionsHex } from "../guard.ts";
import { ask, YES } from "../jev.ts";
import { COLORWAYS_LINE, WORKING } from "../lines.ts";
import { markFrom, markSvg } from "../marks.ts";
import { optionId, type Outcome, type Turn } from "../turn.ts";
import { briefOf } from "./brief.ts";
import { chosenConcept } from "./directions.ts";
import { directionOf } from "./research.ts";
import { familyOf } from "./type.ts";

const HEX = /^#[0-9A-Fa-f]{6}$/;

const DESCRIBED_SHAPE: Shape = {
  type: "OBJECT",
  properties: {
    say: { type: "STRING", description: "What Gala says; names colors by role, never by hex" },
    primary: { type: "STRING", description: "#RRGGBB" },
    secondary: { type: "STRING", description: "#RRGGBB" },
    tertiary: { type: "STRING", nullable: true, description: "#RRGGBB, or null when the person described two colors" },
  },
  required: ["say", "primary", "secondary", "tertiary"],
};

/** Waiting on the pick-your-colors card. */
export async function pickColors(turn: Turn): Promise<Outcome> {
  const card = turn.latest("colorPicker");
  if (card === null) return "wait";
  const picker = card.artifact!;
  if (picker.saved === true && picker.colors !== null) {
    await turn.write([{ op: "project", stage: "colorways" }]);
    return "continue";
  }

  const said = turn.unansweredText();
  if (said === "") return "wait";
  const meaning = await turn.intent(said, {
    describe: "The person describes the colors they want in words",
    other: "The person is asking or saying something else",
  });
  if (meaning !== "describe") {
    await turn.converse("the person to pick their colors on the card and save it");
    return "wait";
  }
  // "Or describe your colors in words": Gala fills the card in; the person still saves it.
  const described = await turn.compose(
    () =>
      turn.think<{ say: string; primary: string; secondary: string; tertiary: string | null }>({
        section: "colors",
        task: "Turn the person's description into a color for each role they described.",
        facts: { brief: briefOf(turn), direction: directionOf(turn) },
        shape: DESCRIBED_SHAPE,
      }),
    (value) => [value.say],
    (value) => !mentionsHex(value.say) && HEX.test(value.primary) && HEX.test(value.secondary) && (value.tertiary === null || HEX.test(value.tertiary)),
  );
  if (described === null) {
    await turn.converse("the person to pick their colors on the card and save it");
    return "wait";
  }
  const colors = { primary: described.primary.toUpperCase(), secondary: described.secondary.toUpperCase(), tertiary: described.tertiary?.toUpperCase() ?? null };
  await turn.write([
    { op: "patchArtifact", messageId: card.id, artifact: { ...picker, colors, saved: false } },
    { op: "say", text: described.say },
  ]);
  return "wait";
}

type Picked = { say: string; colorways: { option: string; name: string; rationale: string }[] };

function pickedShape(options: ColorwayOption[]): Shape {
  return {
    type: "OBJECT",
    properties: {
      say: { type: "STRING", description: "What Gala says above the three colorways" },
      colorways: {
        type: "ARRAY",
        description: "Exactly three, each a different option",
        items: {
          type: "OBJECT",
          properties: {
            option: { type: "STRING", enum: options.map((option) => option.id) },
            name: { type: "STRING", description: "One or two words" },
            rationale: { type: "STRING", description: "One sentence" },
          },
          required: ["option", "name", "rationale"],
        },
      },
    },
    required: ["say", "colorways"],
  };
}

/** Three different options from what the model picked, topped up from the rest if it repeated itself. */
function threeOptions(picked: Picked, options: ColorwayOption[]): { option: ColorwayOption; name: string; rationale: string }[] {
  const chosen: { option: ColorwayOption; name: string; rationale: string }[] = [];
  for (const entry of picked.colorways) {
    const option = options.find((candidate) => candidate.id === entry.option);
    if (option !== undefined && !chosen.some((taken) => taken.option.id === option.id)) chosen.push({ option, name: entry.name, rationale: entry.rationale });
  }
  for (const option of options) {
    if (chosen.length >= 3) break;
    if (!chosen.some((taken) => taken.option.id === option.id)) chosen.push({ option, name: "", rationale: "" });
  }
  return chosen.slice(0, 3);
}

/**
 * Do Gala's words agree with the computed contrast? Jev reads the words
 * against the numbers.
 *
 * What this does not prove: Jev judges agreement in meaning, so a subtle
 * overstatement ("reads well" for a ratio that only just passes) can get
 * through. The numbers shown in the kit's spec sheet are the computed ones
 * regardless of what Gala says.
 */
async function agreesWithNumbers(words: string[], options: ColorwayOption[], signal: AbortSignal): Promise<boolean> {
  const answers = await ask({
    state: { text: words.join("\n"), computed: options },
    questions: { disagrees: { type: "noul", instructions: "Does `text` say anything about contrast or legibility that disagrees with the numbers in `computed`?" } },
    signal,
  });
  return answers.disagrees.noul < YES;
}

export async function colorways(turn: Turn): Promise<Outcome> {
  const picker = turn.latest("colorPicker")!.artifact!;
  const colors = picker.colors as BrandColors;
  const card = turn.latest("colorwaySet");
  const current = card !== null && JSON.stringify(card.artifact!.colors) === JSON.stringify(colors);

  if (current) {
    const set = card.artifact!;
    if (set.chosenId !== null) {
      await turn.write([
        { op: "choice", step: "colorways", chosen: set.chosenId, discarded: set.colorways.filter((entry: { id: string }) => entry.id !== set.chosenId).map((entry: { id: string }) => entry.id) },
        { op: "project", stage: "kit" },
      ]);
      return "continue";
    }
    const said = turn.unansweredText();
    if (said === "") return "wait";
    const picks = Object.fromEntries(set.colorways.map((entry: { letter: string; name: string }) => [entry.letter, `The person chooses colorway ${entry.letter}, ${entry.name}`]));
    const meaning = await turn.intent(said, { ...picks, otherColors: "The person wants different colors", other: "The person is asking or saying something else" });
    const chosen = set.colorways.find((entry: { letter: string }) => entry.letter === meaning);
    if (chosen !== undefined) {
      await turn.write([{ op: "patchArtifact", messageId: card.id, artifact: { ...set, chosenId: chosen.id } }]);
      return "continue";
    }
    if (meaning === "otherColors") {
      // "Or ask for other colors": the pick-your-colors card opens again.
      const pickerCard = turn.latest("colorPicker")!;
      await turn.write([
        { op: "patchArtifact", messageId: pickerCard.id, artifact: { ...pickerCard.artifact!, saved: false } },
        { op: "project", stage: "pickColors" },
      ]);
      await turn.converse("the person to change their colors on the pick-your-colors card and save it");
      return "wait";
    }
    await turn.converse("the person to pick colorway A, B or C, or edit their colors");
    return "wait";
  }

  await turn.status(WORKING.colorways);
  const options = colorwayOptions(colors);
  const describe = (value: Picked) => [value.say, ...value.colorways.flatMap((entry) => [entry.name, entry.rationale])];
  const picked = await turn.compose(
    () =>
      turn.think<Picked>({
        section: "colorways",
        task: "Choose three of the options and write about them. The contrast numbers are computed; say nothing they don't support.",
        facts: { brief: briefOf(turn), direction: directionOf(turn), options },
        shape: pickedShape(options),
      }),
    describe,
    async (value) => !describe(value).some(mentionsHex) && (await agreesWithNumbers(describe(value), threeOptions(value, options).map((entry) => entry.option), turn.signal)),
  );
  // No checked wording after two tries: show the colorways with the fixed line and no claims.
  const three = picked !== null ? threeOptions(picked, options) : threeOptions({ say: "", colorways: [] }, options);

  const chosenMark = chosenConcept(turn, "variationSet");
  const source = await turn.store.readFile(chosenMark.sourceFileId);
  const mark = await markFrom({ bytes: source.bytes, mime: source.contentType });
  const letters = ["A", "B", "C"];
  const cards = await Promise.all(
    three.map(async (entry, index) => ({
      id: optionId(),
      letter: letters[index],
      name: entry.name,
      rationale: entry.rationale,
      ground: hexOf(colors, entry.option.ground),
      // The mark recolored in code from its traced paths, so the color is exact.
      markFileId: await turn.store.saveFile(new TextEncoder().encode(markSvg(mark, hexOf(colors, entry.option.mark))), "image/svg+xml"),
      wordmarkColor: hexOf(colors, entry.option.wordmark),
      roles: [roleName(entry.option.mark), roleName(entry.option.wordmark)],
      // Which role fills what, for the kit.
      assignment: { mark: entry.option.mark, wordmark: entry.option.wordmark, ground: entry.option.ground },
    })),
  );
  await turn.write([
    { op: "artifact", kind: "colorwaySet", artifact: { say: picked?.say ?? COLORWAYS_LINE, brandName: turn.brand, family: familyOf(turn), colors, colorways: cards, chosenId: null } },
  ]);
  return "wait";
}
