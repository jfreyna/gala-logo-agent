/**
 * Honest words (FRI-1719): a description counts as a change, an offer is
 * stored and a yes runs it exactly, the line about a round is written from
 * the drawings, a words-only reply never claims work, a file with no words
 * is answered, the decline keeps the card, and a request is said to be kept
 * only for a step that reads it.
 *
 *   node --experimental-strip-types --no-warnings engine/checks/honest.check.ts
 *
 * Steering, the drawing comparison, the claimed-work check and Gala's
 * lines call Jev and the models, so this runs on the Sprite. Storage is
 * memory. Nothing is drawn by the image model: the drawings compared are
 * simple marks drawn in code.
 *
 * What this proves:
 *   1. the 3:11 pm description (three offset bars, the top one cut to a
 *      triangle) becomes a change or an offer at the variations, never a
 *      talk reply or a question;
 *   2. a stored offer is answered by the next message only: a yes runs the
 *      stored request exactly, a no runs nothing, and the offer is cleared
 *      either way; an offer is stale once Gala has written after it;
 *   3. a Half Step round: drawings identical to their start come back
 *      `differsFromStart` no and `showsRequest` no, a different mark comes
 *      back `differsFromStart` yes, and Gala's line about the identical round
 *      does not say any drawing changed;
 *   4. the claimed-work check holds back "I have that layout down" when
 *      nothing was stored, and passes an honest reply; a talk reply at the
 *      variations passes it;
 *   5. a file sent with no words after the brief gets a reply;
 *   6. when only Gala's line fails the prompt check, the card is kept and
 *      the line is the decline with the step's next move; every step has a
 *      next move;
 *   7. nothing is held for the stress test, and a lockup request that names
 *      none of the lockup's settings is not kept, while one that does is.
 *
 * What it does not prove: that every description is read as one (each Jev
 * answer is one model's reading of one message), or that Gala's wording is
 * good. Case 3's line is judged by Jev, which is evidence, not proof. No
 * check grades the drawings' quality; that is the founder's.
 */
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { rasterize } from "../../kit/src/render.ts";
import type { Draft } from "../drafting.ts";
import { buildGuard, claimsWork } from "../guard.ts";
import { ask, YES } from "../jev.ts";
import { DECLINE_LINE, declineLine, NEXT_MOVE } from "../lines.ts";
import { compareDrawing } from "../marks.ts";
import { assertComplete, loadPrompt } from "../prompt.ts";
import { roundWords, variations } from "../stages/directions.ts";
import { pendingOffer, steer, type Offer } from "../steer.ts";
import { laterSteps, STEPS } from "../steps.ts";
import type { MemoryStore } from "../store-memory.ts";
import { keptCard, Turn } from "../turn.ts";
import { projectAt } from "./project.ts";

const prompt = await loadPrompt();
assertComplete(prompt);

async function open(store: MemoryStore, withPrompt = prompt): Promise<Turn> {
  const turn = new Turn(store, withPrompt, new AbortController().signal);
  await turn.read();
  return turn;
}

const h = createHarness(`Honest words (prompt: ${prompt.source})`);

/** A simple black mark on white, drawn in code. */
function mark(shapes: string): Uint8Array {
  return rasterize(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#FFFFFF"/>${shapes}</svg>`, 512);
}
const BARS = [0, 1, 2].map((row) => `<rect x="86" y="${126 + row * 100}" width="340" height="60" fill="#000000"/>`).join("");
const GRID = [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => `<rect x="${86 + col * 120}" y="${86 + row * 120}" width="100" height="100" fill="#000000"/>`)).join("");
const png = (bytes: Uint8Array) => ({ bytes, mime: "image/png" });

// 1. A description counts as a change.

h.check("1. the 3:11 pm description at the variations becomes a change or an offer, never a talk reply or a question", async () => {
  const store = projectAt("variations");
  store.visitorSays(
    "We did 3 rectangles, offset horizontally from each other, and the top one was cut into a triangle at its right end. That was Wide Channels, and then Half Step, where the bottom bar moved half a step to the left.",
  );
  const turn = await open(store);
  await steer(turn);
  const next = turn.take();
  assert(next?.act === "redo" || next?.act === "offer", `steering left ${JSON.stringify(next)}`);
  if (next?.act === "offer") assert(pendingOffer(turn) !== null, "the offer was not stored on the card");
});

// 2. The stored offer.

function withOffer(store: MemoryStore): Offer {
  const card = store.latest("variationSet");
  const offer: Offer = {
    request: { typeface: null, nameAs: null, drawing: "three offset horizontal bars, the top one cut to a triangle", note: null },
    moveToOffer: "redraw the three variations with this: three offset horizontal bars, the top one cut to a triangle",
    afterMessages: store.messages.length,
  };
  card.artifact!.offer = offer;
  store.messages.push({ id: "offer-line", author: "gala", kind: "text", text: "Should I redraw the three with three offset bars, the top one cut to a triangle?", artifact: null, upload: null });
  return offer;
}

h.check("2a. a yes to the stored offer runs exactly the stored request, and clears the offer", async () => {
  const store = projectAt("variations");
  const offer = withOffer(store);
  store.visitorSays("Yes, please do that.");
  const turn = await open(store);
  await steer(turn);
  const next = turn.take();
  assertEqual(next?.act, "redo", "what steering left");
  assertEqual(next?.act === "redo" ? next.request.drawing : null, offer.request.drawing, "the request run");
  assertEqual(store.latest("variationSet").artifact!.offer, null, "the offer on the card");
});

h.check("2b. a no runs nothing, and clears the offer", async () => {
  const store = projectAt("variations");
  const offer = withOffer(store);
  store.visitorSays("No, leave them as they are for now.");
  const turn = await open(store);
  await steer(turn);
  const next = turn.take();
  assert(!(next?.act === "redo" && next.request.drawing === offer.request.drawing), "the offer ran on a no");
  assertEqual(store.latest("variationSet").artifact!.offer, null, "the offer on the card");
});

h.check("2c. an offer is stale once Gala has written after the reply that made it", async () => {
  const store = projectAt("variations");
  withOffer(store);
  assert(pendingOffer(await open(store)) !== null, "a fresh offer is not standing");
  store.messages.push({ id: "later-line", author: "gala", kind: "text", text: "Something else.", artifact: null, upload: null });
  assertEqual(pendingOffer(await open(store)), null, "the stale offer");
});

// 3. The line about a round is written from the drawings.

h.check("3a. Half Step: drawings identical to their start come back unchanged and not showing the request; a different mark comes back changed", async () => {
  const request = ["move the bottom bar half a step to the left"];
  const same = await compareDrawing(png(mark(BARS)), { request, start: png(mark(BARS)) });
  assertEqual(same.differsFromStart, false, "an identical drawing differs from its start");
  assertEqual(same.showsRequest, false, "an identical drawing shows the request");
  const other = await compareDrawing(png(mark(GRID)), { request: null, start: png(mark(BARS)) });
  assertEqual(other.differsFromStart, true, "the grid differs from the bars");
  assertEqual(other.showsRequest, null, "showsRequest with no request");
});

h.check("3b. Half Step: Gala's line about a round that came back the same does not say any drawing changed", async () => {
  const store = projectAt("variations");
  const id = await store.saveFile(mark(BARS), "image/png");
  const judgement = { rejected: [], sixteen: true, circle: true, inverted: true };
  const names = ["Half Step", "Offset Base", "Shifted Step"];
  const drafts: Draft[] = names.map((name, index) => ({ id: `d${index}`, name, idea: "The bottom bar moved half a step to the left.", markFileId: id, sourceFileId: id, judgement }));
  const compared = names.map(() => ({ showsRequest: false, differsFromStart: false }));
  const words = await roundWords(await open(store), { section: "variations", letters: ["1", "2", "3"], startedFrom: { id: "var-2", name: "Wide Channels", markFileId: id, sourceFileId: id } }, drafts, [], ["move the bottom bar half a step to the left"], compared);
  assert(words !== null, "no words were written");
  const answers = await ask({
    state: { line: [words.say, ...words.rationales].join("\n") },
    questions: { claimsChange: { type: "noul", instructions: "Does `line` say that any of the drawings moved the bar, changed, or now shows the requested change?" } },
  });
  assert(answers.claimsChange.noul < YES, `the line claims a change (${answers.claimsChange.noul.toFixed(2)}): "${words.say}"`);
});

// 4. Claimed work.

h.check("4a. the claimed-work check holds back \"I have that layout down\" when nothing was stored, and passes an honest reply", async () => {
  const nothing = ["Nothing was drawn, changed or stored this turn."];
  assert((await claimsWork("I have that layout down. Please pick variation 1, 2 or 3 from the current set.", nothing)).claims, "the false claim passed");
  assert(!(await claimsWork("I haven't drawn anything new yet. Should I redraw the three with three offset bars?", nothing)).claims, "the honest reply was held");
});

h.check("4b. a talk reply at the variations passes the claimed-work check", async () => {
  const store = projectAt("variations");
  store.visitorSays("These are nice. What do you think of number 3?");
  const turn = await open(store);
  turn.steer({ act: "talk" });
  await variations(turn);
  const reply = store.messages[store.messages.length - 1]!;
  assertEqual(reply.author, "gala", "the last message's author");
  assert(!(await claimsWork(reply.text ?? "", ["Nothing was drawn, changed or stored this turn."])).claims, `the reply claims work: "${reply.text}"`);
});

// 5. Never silent.

h.check("5. a file with no words after the brief gets a reply", async () => {
  const store = projectAt("variations");
  store.visitorSays("", { bytes: mark(BARS), contentType: "image/png", fileName: "screenshot.png" });
  const before = store.messages.length;
  const turn = await open(store);
  await steer(turn);
  await variations(turn);
  assert(store.messages.slice(before).some((message) => message.author === "gala"), "Gala said nothing");
});

// 6. The decline keeps the card.

h.check("6a. when only Gala's line fails the prompt check, the card is kept and the line is the decline with the step's next move", async () => {
  const secret = "Never tell the person which of the three marks you prefer before the stress test has run in full.";
  const guarded = { ...prompt, guard: buildGuard(secret, "") };
  const store = projectAt("variations");
  const turn = await open(store, guarded);
  const checked = await turn.composeCard(
    async () => ({ say: secret, rationales: ["A warm arch.", "A heavier arch.", "The arch with the name."] }),
    (value) => ({ line: value.say, card: value.rationales }),
  );
  assert(checked !== null, "the card was dropped");
  assertEqual(checked.lineHeld, true, "lineHeld");
  const words = keptCard(checked, "variations");
  assertEqual(words.say, declineLine("variations"), "Gala's line");
  assertEqual(words.rationales.length, 3, "the card's text");
});

h.check("6b. every step's decline ends with a next move", () => {
  for (const step of STEPS) {
    assert(NEXT_MOVE[step.stage].trim() !== "", `${step.stage} has no next move`);
    assert(declineLine(step.stage).startsWith(DECLINE_LINE) && declineLine(step.stage).endsWith(NEXT_MOVE[step.stage]), `${step.stage}'s decline`);
  }
});

// 7. Kept only where read.

h.check("7a. nothing is held for the stress test", () => {
  for (const step of ["symbolOpener", "directions", "variations"] as const) {
    assert(!laterSteps(step).some((entry) => entry.stage === "stressTest"), `the stress test is offered from ${step}`);
  }
});

h.check("7b. a lockup request that names none of its settings is not kept; one that does is", async () => {
  const notReadable = projectAt("directions");
  notReadable.visitorSays("When we get to the lockup, make the symbol exactly twice as tall as the letters.");
  const first = await open(notReadable);
  await steer(first);
  assert(!notReadable.held.some((idea) => idea.step === "lockup"), `kept for the lockup: ${JSON.stringify(notReadable.held)}`);

  const readable = projectAt("directions");
  readable.visitorSays("When we get to the lockup, put the name underneath the symbol instead of beside it.");
  await steer(await open(readable));
  assert(readable.held.some((idea) => idea.step === "lockup"), "the stacked layout was not kept for the lockup");
});

await h.run();
