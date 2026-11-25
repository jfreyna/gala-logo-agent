/**
 * Failures answered (FRI-1714), without a model or a browser.
 *
 *   node --experimental-strip-types --no-warnings engine/checks/failures.check.ts
 *
 * It fetches fonts from Google, so it needs the network; no model is
 * asked, so it runs anywhere. Storage is memory.
 *
 * What this proves:
 *   - each known cause gets its own plain line and a way forward, and an
 *     unknown one a plain general line;
 *   - the second identical failure in a row at a step is Repeated, which
 *     offers a step back and no retry; another cause or another step is not;
 *   - end to end through a turn: a typeface that can't draw the name at the
 *     wordmark step writes a Couldn't notice, and the same failure again
 *     writes Repeated;
 *   - a color typeface is never offered (the next in its class takes its
 *     place), and choosing one gets the plain line, at the type step;
 *   - exhausted retries lead to Couldn't start, a turn that ran does not;
 *   - a send that fails keeps the words and the file and says why, the
 *     10 MB and 4,000-character limits included;
 *   - the server's own words reach the page; anything else is a general line.
 *
 * What it does not prove: what the page draws (scripts/check-failures.mjs)
 * or the real deployment (scripts/check-feedback-walk.mjs).
 */
import { ConvexError } from "convex/values";
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { CannotSet } from "../../kit/src/font.ts";
import { messageOf } from "../../src/lib/errors.ts";
import { afterRequest, couldNotStart, noticeOf, sendKeepingInput } from "../../src/studio/failures.ts";
import { ModelError } from "../gemini.ts";
import { runTurn } from "../loop.ts";
import { causeOf, NOTICE_KIND, noticeFor, type Notice } from "../notice.ts";
import { type } from "../stages/type.ts";
import { StorageError } from "../store-convex.ts";
import type { StoredMessage } from "../store.ts";
import { settablePicks, whyNot } from "../typeset.ts";
import { Turn } from "../turn.ts";
import { projectAt } from "./project.ts";

const h = createHarness("Failures answered (FRI-1714)");

/** A typeface with none of the letters in the name, and a color one; both are test cases only. */
const LACKS_LETTERS = "Noto Emoji";
const COLOR = "Noto Color Emoji";

const fontError = new CannotSet("Alata", "missingLetters", "no letters", ["&"]);
const colorError = new CannotSet(COLOR, "color", "color");
const asNotice = (notice: Notice): StoredMessage => ({ id: "n", author: "gala", kind: NOTICE_KIND, text: null, artifact: notice as never, upload: null });

/** Each cause, the error that has it, and what the first notice for it says and offers. */
const FIRST: [string, unknown, string, string, string, string][] = [
  ["a typeface that can't draw the name, at the wordmark", fontError, "wordmark", "Couldn’t draw the wordmark", "Choose another typeface", "back:type"],
  ["the same, at the type step", fontError, "type", "Couldn’t set that typeface", "Choose another typeface", "showType"],
  ["a color typeface", colorError, "type", "Couldn’t use that typeface", "Choose another typeface", "showType"],
  ["a model or check out of reach", new ModelError("Jev did not answer"), "directions", "Couldn’t reach my tools", "Try again", "retry"],
  ["storage refusing", new StorageError(500, "Storage refused /engine/write"), "lockup", "Couldn’t save my work", "Try again", "retry"],
  ["anything else", new Error("boom"), "kit", "Something went wrong", "Try again", "retry"],
];

for (const [name, error, stage, title, label, does] of FIRST) {
  h.check(`${name}: "${title}", with ${label}`, () => {
    const notice = noticeFor(error, stage as never, "Ember & Rye", null);
    const action = notice.actions[0]!;
    assertEqual([notice.kind, notice.title, notice.actions.length, action.label, action.do === "back" ? `back:${action.step}` : action.do], ["couldnt", title, 1, label, does], "the notice");
    assert(notice.say.length > 0 && !/—/.test(notice.say), "the words are empty or carry a dash");
  });
}

h.check("each cause is named from the error itself", () => {
  assertEqual([fontError, colorError, new ModelError("x"), new StorageError(401, "x"), new TypeError("x")].map(causeOf), ["font", "color", "model", "storage", "unknown"], "the causes");
});

h.check("the same cause twice in a row at a step is Repeated: Go back to Type, Tell me what to try, no retry", () => {
  const first = noticeFor(fontError, "wordmark", "Ember & Rye", null);
  const again = noticeFor(fontError, "wordmark", "Ember & Rye", asNotice(first));
  assertEqual([again.kind, again.title, again.actions.map((action) => action.label)], ["repeated", "Same problem twice", ["Go back to Type", "Tell me what to try"]], "the second notice");
  assert(!again.actions.some((action) => action.do === "retry"), "Repeated offered a retry");
});

h.check("another cause, or the same cause at another step, is a first notice again", () => {
  const first = noticeFor(new ModelError("x"), "directions", "Ember & Rye", null);
  assertEqual(noticeFor(fontError, "directions", "Ember & Rye", asNotice(first)).kind, "couldnt", "another cause");
  assertEqual(noticeFor(new ModelError("x"), "variations", "Ember & Rye", asNotice(first)).kind, "couldnt", "another step");
});

h.check("Repeated at the brief has no step to go back to: only Tell me what to try", () => {
  const first = noticeFor(new ModelError("x"), "brief", "", null);
  const again = noticeFor(new ModelError("x"), "brief", "", asNotice(first));
  assertEqual(again.actions.map((action) => action.do), ["prompt"], "the actions");
});

h.check("through a turn: a typeface that can't draw the name writes Couldn't, and Try again with the same typeface writes Repeated", async () => {
  const store = projectAt("wordmark", { withCard: false });
  const card = store.latest("typeSet");
  card.artifact = { ...card.artifact!, directions: card.artifact!.directions.map((entry: { id: string }) => (entry.id === card.artifact!.chosenId ? { ...entry, family: LACKS_LETTERS } : entry)) };
  // No model is asked: the name fails to set before the step reaches one.
  assertEqual(await runTurn(store, {} as never, new AbortController().signal), "done", "the first turn");
  const first = store.latest(NOTICE_KIND).artifact as Notice;
  assertEqual([first.kind, first.cause, first.step, first.title], ["couldnt", "font", "wordmark", "Couldn’t draw the wordmark"], "the first notice");
  // Try again: a turn with nothing new said, so no model reads a message.
  assertEqual(await runTurn(store, {} as never, new AbortController().signal), "done", "the second turn");
  const second = store.latest(NOTICE_KIND).artifact as Notice;
  assertEqual([second.kind, second.actions[0]!.label], ["repeated", "Go back to Type"], "the second notice");
  assert(!store.messages.some((message) => message.kind === "text" && message.author === "gala"), "Gala wrote a plain line instead of a notice");
});

h.check("a color typeface is refused by the check before offering, with the color reason", async () => {
  const verdict = await whyNot(COLOR, ["Ember & Rye"]);
  assert(verdict instanceof CannotSet && verdict.why === "color", `the verdict: ${verdict instanceof CannotSet ? verdict.why : String(verdict)}`);
});

h.check("a color typeface is never offered: the next family in its class takes its place", async () => {
  const family = (name: string) => ({ family: name }) as never;
  const found = await settablePicks({ classes: ["Display"], ranked: () => [family(COLOR), family("Bitter")], names: ["Ember & Rye"], count: 1 });
  assertEqual([found.picks.map((pick) => pick.family.family), found.skipped], [["Bitter"], [COLOR]], "picks and skipped");
});

h.check("choosing a color typeface (a type-tray pick) is un-picked, with the plain line in a Couldn't notice", async () => {
  const store = projectAt("type");
  // As a pick from the type tray leaves the card: the family in A, chosen and saved.
  const card = store.latest("typeSet");
  card.artifact = { ...card.artifact!, directions: card.artifact!.directions.map((entry: { id: string }, index: number) => (index === 0 ? { ...entry, family: COLOR, pick: "person" } : entry)), chosenId: card.artifact!.directions[0].id, saved: true };
  const turn = new Turn(store, {} as never, new AbortController().signal);
  await turn.read();
  await type(turn);
  const notice = store.latest(NOTICE_KIND).artifact as Notice;
  assertEqual([store.latest("typeSet").artifact!.chosenId, notice.cause, notice.title, notice.actions[0]!.do], [null, "color", "Couldn’t use that typeface", "showType"], "the card and the notice");
  assert(/color typeface, and I don’t use those/.test(notice.say), `the words: ${notice.say}`);
  assertEqual(store.project.stage, "type", "the stage");
});

h.check("the studio draws a stored notice by its kind, and Couldn't start says what is saved", () => {
  assertEqual([noticeOf({ kind: "couldnt" }).kind, noticeOf({ kind: "repeated" }).kind, noticeOf({ kind: "stopped" }).kind], ["Couldn't", "Repeated", "Stopped"], "the kinds");
  const start = couldNotStart("busy", "choice");
  assertEqual([start.kind, start.actions[0]!.label], ["Couldn't start", "Try again"], "Couldn't start");
  assert(/busy/.test(start.say) && /Your choice is saved/.test(start.say), start.say);
  assert(/Your message is saved/.test(couldNotStart("network", "message").say), "the message case");
});

h.check("a request that did not start is tried again, then Couldn't start; a turn that ran ends it", () => {
  assertEqual(afterRequest("busy", 0, 3), { next: "retry", afterMs: 2000 }, "first busy");
  assertEqual(afterRequest(null, 2, 3), { next: "retry", afterMs: 6000 }, "third, nothing answered");
  assertEqual(afterRequest("signin", 3, 3), { next: "couldNotStart", reason: "signin" }, "out of retries");
  assertEqual(afterRequest(null, 3, 3), { next: "couldNotStart", reason: "network" }, "out of retries, nothing answered");
  for (const state of ["done", "stopped", "trouble"]) assertEqual(afterRequest(state, 3, 3), { next: "none" }, state);
});

/** A send, and what it should leave: null when it went through, else the line under the bar. */
const SENDS: [string, { attached: boolean; uploadFails?: string; sendFails?: string }, string | null][] = [
  ["a send that goes through clears", { attached: true }, null],
  ["a file over 10 MB keeps the words and the file", { attached: true, uploadFails: "That file is too large. The limit is 10 MB." }, "That file is too large. The limit is 10 MB. Your words are still here; attach a smaller file or send without it."],
  ["a message over 4,000 characters keeps the words", { attached: false, sendFails: "That message is too long." }, "That message is too long. Your words are still here."],
];

for (const [name, setup, expected] of SENDS) {
  h.check(name, async () => {
    let sent = false;
    const result = await sendKeepingInput({
      words: "Here’s our storefront",
      attached: setup.attached ? { name: "storefront.jpg" } : null,
      upload: async () => {
        if (setup.uploadFails) throw new ConvexError(setup.uploadFails);
        return "upload-1";
      },
      send: async () => {
        if (setup.sendFails) throw new ConvexError(setup.sendFails);
        sent = true;
      },
      messageOf,
    });
    assertEqual([result, sent], [expected, expected === null], "the result and whether it was sent");
  });
}

h.check("the server's own words reach the page; anything else is a general line, never the internals", () => {
  assertEqual(messageOf(new ConvexError("That step is done.")), "That step is done.", "a ConvexError");
  const general = messageOf(new Error("[CONVEX M(studio:act)] Server Error"));
  assert(!/CONVEX|Server Error/.test(general) && general.length > 0, `the general line: ${general}`);
});

await h.run();
