/**
 * The lockup: the approved symbol and the approved wordmark together. The
 * person approves it, changes the layout or the space between the two, or
 * goes back to change the symbol.
 *
 * Jev reads Layout and Space between from what the person said
 * (settings.ts). There are no drawing checks here: the symbol passed its
 * stress test. Color opens only when the lockup is approved.
 */
import type { Shape } from "../gemini.ts";
import { WORKING } from "../lines.ts";
import { describeSettings, GAP_SCALE, isValue, LAYOUT, readSettings, SPACE_BETWEEN, type Layout, type SpaceBetween } from "../settings.ts";
import type { StoredMessage } from "../store.ts";
import { keptCard, type Outcome, type Turn } from "../turn.ts";
import { openColors } from "./color.ts";
import { chosenConcept } from "./directions.ts";
import { familyOf } from "./type.ts";
import { letterSpacingOf } from "./wordmark.ts";

const SAY: Shape = { type: "OBJECT", properties: { say: { type: "STRING" } }, required: ["say"] };

async function show(turn: Turn, previous: StoredMessage | null): Promise<Outcome> {
  await turn.status(WORKING.lockup);
  const mark = chosenConcept(turn, "variationSet");
  const family = familyOf(turn);
  const before = previous?.artifact ?? {};
  const current: { layout: Layout; spaceBetween: SpaceBetween } = {
    layout: isValue(LAYOUT, before.layout) ? before.layout : "sideBySide",
    spaceBetween: isValue(SPACE_BETWEEN, before.spaceBetween) ? before.spaceBetween : "asSet",
  };

  const said = [...turn.heldFor("lockup"), turn.said].filter((text) => text !== "").join("\n");
  let unsureAbout: string[] = [];
  if (said !== "") {
    const read = await readSettings(said, { layout: { setting: LAYOUT, current: current.layout }, spaceBetween: { setting: SPACE_BETWEEN, current: current.spaceBetween } }, turn.signal);
    console.log(describeSettings("lockup", read));
    current.layout = read.layout.value as Layout;
    current.spaceBetween = read.spaceBetween.value as SpaceBetween;
    unsureAbout = [...(read.layout.unsure ? ["the layout"] : []), ...(read.spaceBetween.unsure ? ["the space between the symbol and the name"] : [])];
  }

  const wordsChecked = await turn.composeCard(
    () =>
      turn.think<{ say: string }>({
        section: "conversation",
        task: "The symbol passed its stress test and is approved, and this step is the lockup: the symbol and the wordmark together. Say that in a sentence or two, and which layout is shown. The kit will hold both layouts. Then ask the person to approve the lockup, or to ask for a change to the layout, the space between the two, or the symbol. If you are unsure about something they asked for, ask about that in one short question.",
        facts: {
          step: "lockup",
          symbol: mark.name,
          name: turn.nameAsSet,
          typeface: family,
          layout: LAYOUT.values[current.layout].label,
          spaceBetween: SPACE_BETWEEN.values[current.spaceBetween].label,
          unsureWhatThePersonWantsFor: unsureAbout.length > 0 ? unsureAbout : null,
          comesNext: "color",
        },
        shape: SAY,
      }),
    (value) => ({ line: value.say, card: [mark.name] }),
  );
  if (wordsChecked === null) {
    await turn.decline();
    return "wait";
  }
  const words = keptCard(wordsChecked, turn.stage);

  await turn.write([
    {
      op: "artifact",
      kind: "lockup",
      artifact: {
        say: words.say,
        brandName: turn.nameAsSet,
        family,
        letterSpacingEm: letterSpacingOf(turn),
        markName: mark.name,
        markFileId: mark.markFileId,
        layout: current.layout,
        spaceBetween: current.spaceBetween,
        gapScale: GAP_SCALE[current.spaceBetween],
        approved: false,
      },
    },
  ]);
  return "wait";
}

/** What the approved lockup sets for the kit: the gap, and the layout the person will use most. Defaults for a project from before the lockup step. */
export function lockupOf(turn: Turn): { gapScale: number; layout: "primary" | "stacked" } {
  const card = turn.current("lockup")?.artifact;
  return { gapScale: isValue(SPACE_BETWEEN, card?.spaceBetween) ? GAP_SCALE[card.spaceBetween] : 1, layout: card?.layout === "stacked" ? "stacked" : "primary" };
}

export async function lockup(turn: Turn): Promise<Outcome> {
  const next = turn.take();
  const card = turn.current("lockup");
  if (card === null) return show(turn, null);

  if (next?.act === "redo") {
    // A change to the symbol itself: another round of variations from it, with what was asked.
    if (next.request.drawing !== null) {
      await turn.write([{ op: "project", stage: "variations" }]);
      turn.steer(next);
      return "continue";
    }
    return show(turn, card);
  }

  // The lockup is approved: color opens.
  if (card.artifact!.approved === true) {
    return openColors(turn, [{ op: "choice", step: "lockup", chosen: `${card.artifact!.layout}, ${card.artifact!.spaceBetween}`, discarded: [] }]);
  }

  if (next !== null) await turn.answer(next, `the person to approve the lockup, or ask for a change to the layout, the space between, or the symbol`);
  return "wait";
}
