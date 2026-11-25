/**
 * Phase 3, the stress test, on the chosen variation: 16px, a circle
 * avatar, inverted, and poster size. Code renders each case, Jev judges
 * the render, and Gala reports what came back. The person then approves
 * the mark or sends it back for another round of variations.
 */
import type { Shape } from "../gemini.ts";
import { PICK_COLORS_LINE, WORKING } from "../lines.ts";
import { markFrom, stressTest as runTests } from "../marks.ts";
import type { Outcome, Turn } from "../turn.ts";
import { chosenConcept } from "./directions.ts";

const SAY: Shape = { type: "OBJECT", properties: { say: { type: "STRING" } }, required: ["say"] };

export async function stressTest(turn: Turn): Promise<Outcome> {
  const next = turn.take();
  const card = turn.current("stressTest");
  const chosen = chosenConcept(turn, "variationSet");

  if (!turn.isNewer(card, turn.latest("variationSet"))) {
    await turn.status(WORKING.stressTest);
    const source = await turn.store.readFile(chosen.sourceFileId);
    const checks = await runTests(await markFrom({ bytes: source.bytes, mime: source.contentType }), turn.signal);
    const words = await turn.compose(
      () =>
        turn.think<{ say: string }>({
          section: "stressTest",
          task: "Report the stress test results for the chosen mark.",
          facts: { mark: chosen.name, passed: checks },
          shape: SAY,
        }),
      (value) => ({ line: value.say }),
    );
    if (words === null) {
      await turn.decline();
      return "wait";
    }
    await turn.write([{ op: "artifact", kind: "stressTest", artifact: { say: words.say, brandName: turn.nameAsSet, markFileId: chosen.markFileId, sourceFileId: chosen.sourceFileId, checks } }]);
    return "wait";
  }

  // A change to the mark: another round of variations from this one, with what was asked.
  if (next?.act === "redo") {
    await turn.write([{ op: "project", stage: "variations" }]);
    turn.steer(next);
    return "continue";
  }
  if (card!.artifact!.approved === true) {
    // Colors already picked on an earlier pass come back filled in, still to be saved.
    const earlier = turn.latest("colorPicker")?.artifact?.colors ?? null;
    await turn.write([
      { op: "artifact", kind: "colorPicker", artifact: { say: PICK_COLORS_LINE, colors: earlier, saved: false } },
      { op: "project", stage: "pickColors" },
    ]);
    return "wait";
  }
  if (next !== null) await turn.answer(next, `the person to approve ${chosen.name} or ask for a change`);
  return "wait";
}
