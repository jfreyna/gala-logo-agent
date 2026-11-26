/**
 * Phase 3, the stress test, on the chosen variation: 16px, a circle
 * avatar, inverted, and poster size. Code renders each case, Jev judges
 * the render, and Gala reports what came back. The person then approves
 * the mark, which opens the lockup, or sends it back for another round of
 * variations.
 */
import type { Shape } from "../gemini.ts";
import { WORKING } from "../lines.ts";
import { markFrom, stressTest as runTests } from "../marks.ts";
import { keptCard, type Outcome, type Turn } from "../turn.ts";
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
    const wordsChecked = await turn.composeCard(
      () =>
        turn.think<{ say: string }>({
          section: "stressTest",
          task: "Report the stress test results for the chosen mark.",
          facts: { mark: chosen.name, passed: checks },
          shape: SAY,
        }),
      (value) => ({ line: value.say }),
    );
    if (wordsChecked === null) {
      await turn.decline();
      return "wait";
    }
    const words = keptCard(wordsChecked, turn.stage);
    await turn.write([{ op: "artifact", kind: "stressTest", artifact: { say: words.say, brandName: turn.nameAsSet, markFileId: chosen.markFileId, sourceFileId: chosen.sourceFileId, checks } }]);
    return "wait";
  }

  // A change to the mark: another round of variations from this one, with what was asked.
  if (next?.act === "redo") {
    await turn.write([{ op: "project", stage: "variations" }]);
    turn.steer(next);
    return "continue";
  }
  // The mark is approved: the lockup shows it with the wordmark, and color waits for that sign-off.
  if (card!.artifact!.approved === true) {
    await turn.write([{ op: "project", stage: "lockup" }]);
    return "continue";
  }
  if (next !== null) await turn.answer(next, `the person to approve ${chosen.name} or ask for a change`);
  return "wait";
}
