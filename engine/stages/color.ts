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
import { COLORWAYS_LINE, PICK_COLORS_LINE, WORKING } from "../lines.ts";
import type { Operation } from "../store.ts";
import { markFrom, markSvg } from "../marks.ts";
import { asked, optionId, type Outcome, type Turn } from "../turn.ts";
import { briefOf } from "./brief.ts";
import { pickedRound, placeOf, roundsOf } from "../rounds.ts";
import { broughtBackLine, chosenConcept } from "./directions.ts";
import { directionOf } from "./research.ts";
import { familyOf } from "./type.ts";
import { letterSpacingOf } from "./wordmark.ts";

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

/**
 * Opens the color step: the pick-your-colors card, and the stage. Called
 * by the step whose sign-off comes before color (the lockup, or the symbol
 * opener for a logo with no symbol). Colors the person described ahead of
 * time fill the card in; they still save it.
 */
export async function openColors(turn: Turn, before: Operation[]): Promise<Outcome> {
  // Colors already picked on an earlier pass come back filled in. Colors already saved stay saved, so a change to the
  // symbol or the lockup made at the colorways comes back to the colorways with the person's colors (Edit colors still opens them).
  const previous = turn.latest("colorPicker")?.artifact ?? null;
  const earlier = previous?.colors ?? null;
  const kept = turn.heldFor("pickColors", "colorways");
  const keepSaved = previous?.saved === true && earlier !== null && kept.length === 0;
  await turn.write([...before, { op: "artifact", kind: "colorPicker", artifact: { say: PICK_COLORS_LINE, colors: earlier, saved: keepSaved } }, { op: "project", stage: "pickColors" }]);
  if (keepSaved) return "continue";
  if (kept.length === 0) return "wait";
  turn.steer({ act: "redo", request: { typeface: null, nameAs: null, drawing: null, note: kept.join("\n") } });
  return "continue";
}

/** Waiting on the pick-your-colors card. */
export async function pickColors(turn: Turn): Promise<Outcome> {
  const next = turn.take();
  const card = turn.current("colorPicker");
  if (card === null) return "wait";
  const picker = card.artifact!;
  if (picker.saved === true && picker.colors !== null && next?.act !== "redo") {
    await turn.write([{ op: "project", stage: "colorways" }]);
    return "continue";
  }

  if (next === null) return "wait";
  if (next.act !== "redo") {
    await turn.answer(next, "the person to pick their colors on the card and save it");
    return "wait";
  }
  // "Or describe your colors in words": Gala fills the card in; the person still saves it.
  const described = await turn.compose(
    () =>
      turn.think<{ say: string; primary: string; secondary: string; tertiary: string | null }>({
        section: "colors",
        task: "Turn the person's description into a color for each role they described.",
        facts: { brief: briefOf(turn), direction: directionOf(turn), theirDescription: asked(next.request) },
        shape: DESCRIBED_SHAPE,
      }),
    (value) => ({ line: value.say }),
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
  const next = turn.take();
  const picker = turn.latest("colorPicker")!.artifact!;
  const colors = picker.colors as BrandColors;
  // Every round of colorways in the current colors; a pick on any of them counts (rounds.ts).
  const rounds = roundsOf(turn, "colorwaySet");
  const card = rounds[rounds.length - 1] ?? null;

  if (card !== null) {
    const picked = pickedRound(rounds);
    if (picked !== null) {
      const set = picked.artifact!;
      // A pick on an earlier round brings that round back as the newest card, with Gala's line naming it, so the kit reads the newest card.
      const bringBack =
        picked.id !== card.id
          ? [
              {
                op: "artifact" as const,
                kind: "colorwaySet",
                artifact: {
                  ...set,
                  say: await broughtBackLine(turn, "colorways", set.colorways.find((entry: { id: string }) => entry.id === set.chosenId)?.name || "That colorway", rounds, picked),
                  broughtBack: placeOf(rounds, picked),
                },
              },
            ]
          : [];
      await turn.write([
        ...bringBack,
        { op: "choice", step: "colorways", chosen: set.chosenId, discarded: set.colorways.filter((entry: { id: string }) => entry.id !== set.chosenId).map((entry: { id: string }) => entry.id) },
        { op: "project", stage: "kit" },
      ]);
      return "continue";
    }
    if (next?.act === "redo") {
      // "Or ask for other colors": the pick-your-colors card opens again, and a description in words fills it in.
      const pickerCard = turn.latest("colorPicker")!;
      await turn.write([
        { op: "patchArtifact", messageId: pickerCard.id, artifact: { ...pickerCard.artifact!, saved: false } },
        { op: "project", stage: "pickColors" },
      ]);
      turn.steer(next);
      return "continue";
    }
    if (next !== null) await turn.answer(next, "the person to pick colorway A, B or C, or edit their colors");
    return "wait";
  }

  await turn.status(WORKING.colorways);
  // A logo with no symbol has one thing to color: every option colors the name, on white or on another of the colors.
  const nameOnly = turn.nameOnly;
  const options = nameOnly
    ? colorwayOptions(colors)
        .filter((option) => option.mark === option.wordmark)
        .map(({ markOnGround: _mark, ...option }) => ({ ...option, markOnGround: option.wordmarkOnGround }))
    : colorwayOptions(colors);
  const cardOf = (value: Picked) => value.colorways.flatMap((entry) => [entry.name, entry.rationale]);
  const describe = (value: Picked) => [value.say, ...cardOf(value)];
  const picked = await turn.compose(
    () =>
      turn.think<Picked>({
        section: "colorways",
        task: `Choose three of the options and write about them. The contrast numbers are computed; say nothing they don't support.${nameOnly ? " The logo is the name alone, with no symbol: write only about the name and its ground, and never mention a mark or a symbol." : ""}`,
        facts: { brief: briefOf(turn), direction: directionOf(turn), logo: nameOnly ? "the name alone, with no symbol" : "a symbol and the name", options: nameOnly ? options.map(({ id, wordmark, ground, wordmarkOnGround }) => ({ id, name: wordmark, ground, nameOnGround: wordmarkOnGround })) : options },
        shape: pickedShape(options),
      }),
    (value) => ({ line: value.say, card: cardOf(value) }),
    async (value) => !describe(value).some(mentionsHex) && (await agreesWithNumbers(describe(value), threeOptions(value, options).map((entry) => entry.option), turn.signal)),
  );
  // No checked wording after two tries: show the colorways with the fixed line and no claims.
  const three = picked !== null ? threeOptions(picked, options) : threeOptions({ say: "", colorways: [] }, options);

  // The mark recolored in code from its traced paths, so the color is exact. A logo with no symbol has no mark to color.
  let mark: Awaited<ReturnType<typeof markFrom>> | null = null;
  if (!nameOnly) {
    const chosenMark = chosenConcept(turn, "variationSet");
    const source = await turn.store.readFile(chosenMark.sourceFileId);
    mark = await markFrom({ bytes: source.bytes, mime: source.contentType });
  }
  const letters = ["A", "B", "C"];
  const cards = await Promise.all(
    three.map(async (entry, index) => ({
      id: optionId(),
      letter: letters[index],
      name: entry.name,
      rationale: entry.rationale,
      ground: hexOf(colors, entry.option.ground),
      ...(mark !== null ? { markFileId: await turn.store.saveFile(new TextEncoder().encode(markSvg(mark, hexOf(colors, entry.option.mark))), "image/svg+xml") } : {}),
      wordmarkColor: hexOf(colors, entry.option.wordmark),
      // The roles the colorway leans on: the mark and the name, or for a name alone, the name and its ground when that is one of the colors.
      roles: mark !== null ? [roleName(entry.option.mark), roleName(entry.option.wordmark)] : [roleName(entry.option.wordmark), ...(entry.option.ground !== "white" ? [roleName(entry.option.ground)] : [])],
      // Which role fills what, for the kit.
      assignment: { mark: entry.option.mark, wordmark: entry.option.wordmark, ground: entry.option.ground },
    })),
  );
  await turn.write([
    { op: "artifact", kind: "colorwaySet", artifact: { say: picked?.say ?? COLORWAYS_LINE, brandName: turn.nameAsSet, family: familyOf(turn), letterSpacingEm: letterSpacingOf(turn), colors, colorways: cards, chosenId: null } },
  ]);
  return "wait";
}
