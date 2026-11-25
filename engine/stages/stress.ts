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
  const card = turn.latest("stressTest");
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
    await turn.write([{ op: "artifact", kind: "stressTest", artifact: { say: words.say, brandName: turn.brand, markFileId: chosen.markFileId, sourceFileId: chosen.sourceFileId, checks } }]);
    return "wait";
  }

  const said = turn.unansweredText();
  if (said === "") return "wait";
  const meaning = await turn.intent(said, {
    approve: "The person accepts the mark and wants to go on",
    change: "The person wants the mark changed",
    other: "The person is asking or saying something else",
  });
  if (meaning === "approve") {
    await turn.write([
      { op: "artifact", kind: "colorPicker", artifact: { say: PICK_COLORS_LINE, colors: null, saved: false } },
      { op: "project", stage: "pickColors" },
    ]);
    return "wait";
  }
  if (meaning === "change") {
    await turn.write([{ op: "project", stage: "variations" }]);
    return "continue";
  }
  await turn.converse(`the person to approve ${chosen.name} or ask for a change`);
  return "wait";
}
