/**
 * Small feedback, without a model or a browser.
 *
 *   node --experimental-strip-types --no-warnings engine/checks/feedback.check.ts
 *
 * What this proves: which actions hand the next move to the message box
 * (Handed off) and for how long; a turn stopped mid-step writes Gala's
 * Stopped line, words only, and the studio draws it as Stopped; the line
 * says nothing was kept only when nothing was.
 *
 * What it does not prove: what the page draws (scripts/check-feedback-drawn.mjs).
 */
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { afterRequest, noticeOf } from "../../src/studio/failures.ts";
import { HAND_OFF_MS, handsOff } from "../../src/studio/handoff.ts";
import { runTurn } from "../loop.ts";
import { NOTICE_KIND, stoppedNotice, type Notice } from "../notice.ts";
import { projectAt } from "./project.ts";

const h = createHarness("Small feedback");

/** Each action and whether it hands off to the box. */
const HANDS_OFF: [string, { type: string; action?: { do?: string } }, boolean][] = [
  ["Change something on the direction", { type: "changeDirection" }, true],
  ["Edit on the brief", { type: "editBrief" }, true],
  ["Tell me what to try, on a Repeated notice", { type: "notice", action: { do: "prompt" } }, true],
  ["Try again, on a notice", { type: "notice", action: { do: "retry" } }, false],
  ["Looks right", { type: "approveDirection" }, false],
  ["Change typeface (a turn, not a hand-off)", { type: "changeTypeface" }, false],
];

for (const [name, action, expected] of HANDS_OFF) {
  h.check(`${name}: ${expected ? "hands off to the box" : "does not hand off"}`, () => assertEqual(handsOff(action), expected, "hands off"));
}

h.check("Handed off lasts 6 seconds when the person doesn't type", () => assertEqual(HAND_OFF_MS, 6000, "the time"));

h.check("a turn stopped mid-step writes the Stopped line, says nothing was kept, and offers Try again", async () => {
  const store = projectAt("wordmark", { withCard: false });
  const controller = new AbortController();
  controller.abort();
  assertEqual(await runTurn(store, {} as never, controller.signal), "stopped", "the turn's result");
  const notice = store.latest(NOTICE_KIND).artifact as Notice;
  assertEqual([notice.kind, notice.say, notice.actions], ["stopped", "Stopped. Nothing from that turn was kept. Try again, or tell me what to do next.", [{ label: "Try again", do: "retry" }]], "the notice");
  assert(!store.messages.some((message) => message.kind === "wordmark"), "a wordmark was written");
});

h.check("when the turn had written something before the stop, the line doesn't say nothing was kept", () => {
  assertEqual([stoppedNotice("directions", true).say, stoppedNotice("directions", true).actions.length], ["Stopped. Tell me what to do next.", 0], "the line and its buttons");
});

h.check("the studio draws a stored Stopped notice as Stopped, and a stopped request asks for nothing more", () => {
  assertEqual(noticeOf(stoppedNotice("wordmark", false) as never).kind, "Stopped", "the kind");
  assertEqual(afterRequest("stopped", 0, 3), { next: "none" }, "after a stop");
});

await h.run();
