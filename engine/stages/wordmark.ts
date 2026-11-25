/**
 * The wordmark: the name set in the chosen typeface, on its own, before
 * any symbol. The person approves it, changes its case or its letter
 * spacing, or picks another typeface.
 *
 * Code sets the name. Jev reads Case and Spacing from what the person said
 * (settings.ts), and checks that the name still reads at 16px. The model
 * writes only Gala's line. Nothing moves on until the wordmark is approved.
 */
import { setText } from "../../kit/src/font.ts";
import { bounds, toSvgPathData } from "../../kit/src/path.ts";
import { rasterize } from "../../kit/src/render.ts";
import type { Image, Shape } from "../gemini.ts";
import { ask, YES } from "../jev.ts";
import { WORKING } from "../lines.ts";
import { CASE, describeSettings, inCase, isValue, LETTER_SPACING_EM, readSettings, SPACING, type Case, type Spacing } from "../settings.ts";
import type { StoredMessage } from "../store.ts";
import { type Outcome, type Turn } from "../turn.ts";
import { fontFor } from "../typeset.ts";
import { familyOf } from "./type.ts";

const SAY: Shape = { type: "OBJECT", properties: { say: { type: "STRING" } }, required: ["say"] };

/**
 * The name at 16px, as a judge sees it: drawn 16px tall in black on a white
 * square, then enlarged pixel for pixel, because TypeSafe refuses images
 * under 280px a side.
 */
export async function nameAt16(family: string, name: string, letterSpacing: number): Promise<Image> {
  const font = await fontFor(family);
  const text = setText(font, name, 16, letterSpacing);
  const box = bounds(text.segments);
  const side = Math.ceil(Math.max(box.width, 16)) + 8;
  const drawn = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}"><rect width="${side}" height="${side}" fill="#FFFFFF"/><path fill="#000000" transform="translate(${(side - box.width) / 2 - box.x} ${side / 2 + text.capHeight / 2})" d="${toSvgPathData(text.segments)}"/></svg>`;
  const tiny = Buffer.from(rasterize(drawn, side)).toString("base64");
  const scale = Math.ceil(320 / side);
  const enlarged = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${side} ${side}"><image width="${side}" height="${side}" image-rendering="optimizeSpeed" xlink:href="data:image/png;base64,${tiny}"/></svg>`;
  return { bytes: rasterize(enlarged, side * scale), mime: "image/png" };
}

/** One yes or no from Jev: can the name still be read at 16px. */
async function readsAt16(family: string, name: string, letterSpacing: number, signal: AbortSignal): Promise<boolean> {
  const answers = await ask({
    state: { name },
    images: { small: await nameAt16(family, name, letterSpacing) },
    questions: { reads: { type: "noul", instructions: "`small` is `name` set in type at 16 pixels and enlarged. Can the name still be read?" } },
    signal,
  });
  return answers.reads.noul >= YES;
}

/** Sets the name and shows the card. `previous` is the card being changed, when there is one. */
async function show(turn: Turn, previous: StoredMessage | null): Promise<Outcome> {
  await turn.status(WORKING.wordmark);
  const family = familyOf(turn);
  const before = previous?.artifact ?? {};
  const current: { case: Case; spacing: Spacing } = { case: isValue(CASE, before.case) ? before.case : "asTyped", spacing: isValue(SPACING, before.spacing) ? before.spacing : "asDrawn" };

  // What the person said just now, and anything they asked for ahead of this step.
  const said = [...turn.heldFor("wordmark"), turn.said].filter((text) => text !== "").join("\n");
  let unsureAbout: string[] = [];
  if (said !== "") {
    const read = await readSettings(said, { case: { setting: CASE, current: current.case }, spacing: { setting: SPACING, current: current.spacing } }, turn.signal);
    console.log(describeSettings("wordmark", read));
    current.case = read.case.value as Case;
    current.spacing = read.spacing.value as Spacing;
    unsureAbout = [...(read.case.unsure ? ["the case"] : []), ...(read.spacing.unsure ? ["the letter spacing"] : [])];
  }

  const name = inCase(turn.nameAsTyped, current.case);
  const letterSpacing = LETTER_SPACING_EM[current.spacing];
  const reads = await readsAt16(family, name, letterSpacing, turn.signal);

  const words = await turn.compose(
    () =>
      turn.think<{ say: string }>({
        section: "conversation",
        task: "The typeface is chosen, and this step is the wordmark: the name set in that typeface on its own, before any symbol. Say that in a sentence or two: how the name is set (its case and its letter spacing), and whether it still reads at 16px. Then ask the person to approve it, or to ask for a change to the case, the spacing or the typeface. If you are unsure about something they asked for, ask about that in one short question.",
        facts: {
          step: "wordmark",
          name,
          typeface: family,
          case: CASE.values[current.case].label,
          letterSpacing: SPACING.values[current.spacing].label,
          readsAt16px: reads,
          unsureWhatThePersonWantsFor: unsureAbout.length > 0 ? unsureAbout : null,
          comesNext: "the symbol",
        },
        shape: SAY,
      }),
    (value) => ({ line: value.say }),
  );
  if (words === null) {
    await turn.decline();
    return "wait";
  }

  await turn.write([{ op: "artifact", kind: "wordmark", artifact: { say: words.say, brandName: name, family, case: current.case, spacing: current.spacing, letterSpacingEm: letterSpacing, readsAt16: reads, approved: false } }]);
  return "wait";
}

/** The approved wordmark's letter spacing, in ems. A project from before the wordmark step has none: as drawn. */
export function letterSpacingOf(turn: Turn): number {
  const spacing = turn.current("wordmark")?.artifact?.spacing;
  return isValue(SPACING, spacing) ? LETTER_SPACING_EM[spacing] : 0;
}

export async function wordmark(turn: Turn): Promise<Outcome> {
  const next = turn.take();
  const card = turn.current("wordmark");
  // First visit, or a change to the case or the spacing: the name is set again.
  if (card === null || next?.act === "redo") return show(turn, card);

  if (card.artifact!.approved === true) {
    await turn.write([
      { op: "choice", step: "wordmark", chosen: `${card.artifact!.case}, ${card.artifact!.spacing}`, discarded: [] },
      { op: "project", stage: "symbolOpener" },
    ]);
    return "continue";
  }

  if (next !== null) await turn.answer(next, "the person to approve the wordmark, or ask for a change to the case, the spacing or the typeface");
  return "wait";
}
