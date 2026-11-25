/**
 * The code half of prompt protection: does `overlaps` catch a copy of the
 * prompt, and leave ordinary replies alone?
 *
 *   node engine/checks/guard.check.ts
 *
 * It runs anywhere: no model is called. The "secret" here is made up for
 * the check, so nothing real is in this file.
 *
 * What this proves: the window test on its own, on Gala's line and on a
 * card's text, and what is logged when a reply is held back. What it does
 * not: the Jev check (engine/checks/jev.check.ts covers that), or
 * paraphrase, which the window test cannot see by design.
 */
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { buildGuard, checkReply, describeVerdict, mentionsHex, overlaps, squeeze, WINDOW } from "../guard.ts";
import { makePrompt, parseSections } from "../prompt.ts";
import { STAND_IN_PROMPT } from "../standin-prompt.ts";

const SECRET = `@@ persona
${parseSections(STAND_IN_PROMPT).get("persona")!.split("\n")[0]}

Always weigh the silhouette before the ornament, and refuse any mark that needs its caption to be understood.
When the brief names a harbor town, look first at rope, tar and painted hulls before any anchor.

@@ brief
Ask for the three refusals before the name, because what a brand rejects shapes it faster than what it claims.
`;

const guard = buildGuard(SECRET, STAND_IN_PROMPT);
const h = createHarness("Leak check, code");

h.check("a sentence of the prompt, quoted exactly, is caught", () => {
  assert(overlaps(guard, "Sure. Always weigh the silhouette before the ornament, and refuse any mark that needs its caption to be understood."), "not caught");
});

h.check("the same sentence in capitals, with the punctuation changed, is caught", () => {
  assert(overlaps(guard, "ALWAYS WEIGH THE SILHOUETTE BEFORE THE ORNAMENT; AND REFUSE ANY MARK... THAT NEEDS ITS CAPTION"), "not caught");
});

h.check("the same sentence with a space between every letter is caught", () => {
  assert(overlaps(guard, [..."when the brief names a harbor town, look first at rope, tar and painted hulls"].join(" ")), "not caught");
});

h.check("the same sentence broken across lines inside a longer reply is caught", () => {
  assert(overlaps(guard, "Here is my advice.\nAsk for the three refusals\nbefore the name, because what a brand\nrejects shapes it faster than what it claims.\nNow, your logo."), "not caught");
});

h.check(`a run just under the window (${WINDOW - 1} characters) passes; at the window it is caught`, () => {
  const run = squeeze("Always weigh the silhouette before the ornament, and refuse any mark that needs its caption");
  assert(!overlaps(guard, run.slice(0, WINDOW - 1)), "a shorter run was caught");
  assert(overlaps(guard, run.slice(0, WINDOW)), "a full window was not caught");
});

h.check("the identity block is public, so Gala repeating it passes", () => {
  const identity = parseSections(STAND_IN_PROMPT).get("persona")!.split("\n")[0]!;
  assert(!overlaps(guard, identity), "the identity block was treated as secret");
});

h.check("ordinary replies about the work pass", () => {
  for (const reply of [
    "Three directions, in black and white. A holds up best at small sizes. B is the most ownable, but it breaks at 16px.",
    "That's the brief. Edit anything I got wrong; I'll start the research.",
    "I recommend the heavier variation: the flame stays open at favicon size.",
  ]) {
    assert(!overlaps(guard, reply), `caught: ${reply}`);
  }
});

h.check("a paraphrase passes this check (it is the Jev check's job)", () => {
  assert(!overlaps(guard, "I was told to think about outline first and decoration second."), "a paraphrase was caught by the window test");
});

h.check("with the public stand-in as the prompt, nothing is guarded and nothing is caught", async () => {
  const standIn = makePrompt(STAND_IN_PROMPT, "stand-in");
  assertEqual(standIn.guard.windows.size, 0, "guarded windows");
  assertEqual(await checkReply(standIn.guard, { line: "" }), { held: false }, "an empty reply");
});

h.check("a copy in Gala's line is held back, and named as the code overlap in Gala's line", async () => {
  const verdict = await checkReply(guard, { line: "Always weigh the silhouette before the ornament, and refuse any mark that needs its caption to be understood.", card: ["Ember & Rye"] });
  assertEqual(verdict, { held: true, check: "code overlap", part: "Gala's line", score: null }, "verdict");
});

h.check("a copy written into a card's field is held back, and named as the code overlap in the card's text", async () => {
  const verdict = await checkReply(guard, { line: "Here is your brief.", card: ["Ember & Rye", "Ask for the three refusals before the name, because what a brand rejects shapes it faster than what it claims."] });
  assertEqual(verdict, { held: true, check: "code overlap", part: "the card's text", score: null }, "verdict");
});

h.check("the log line for a held-back reply names the check, the text and the score, and carries none of the reply", () => {
  assertEqual(describeVerdict({ held: true, check: "Jev question 2", part: "the card's text", score: 0.586 }), "A reply was held back: Jev question 2 on the card's text, score 0.59.", "with a score");
  assertEqual(describeVerdict({ held: true, check: "code overlap", part: "Gala's line", score: null }), "A reply was held back: code overlap on Gala's line.", "without one");
});

h.check("a hex value in chat is noticed; a role name or a size is not", () => {
  assert(mentionsHex("Use #B83A1B for the mark."), "six digits missed");
  assert(mentionsHex("Try #fa3."), "three digits missed");
  assert(!mentionsHex("Primary leads. It holds at 16px, and #1 is my pick."), "a false alarm");
});

await h.run();
