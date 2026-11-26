/**
 * Next-move buttons (FRI-1722): each button does what the typed path does,
 * and a row shows Done once its move is answered, the same after a reload.
 *
 *   node --experimental-strip-types --no-warnings engine/checks/buttons.check.ts
 *
 * Storage is memory. A press is the card patch the act case writes
 * (convex/studio.ts) plus the echo line it leaves, applied here by hand; the
 * engine then takes its turn as it would after the act wakes it. Nothing
 * here calls Jev or a model: every path a button takes is a stored answer
 * the engine acts on in code.
 *
 * What this proves:
 *   1. "Yes, redraw" runs the stored offer's request exactly (the same
 *      request a typed yes runs), clears the offer, and records the answer;
 *   2. "No" runs nothing, steers to a reply in words, clears the offer, and
 *      records the answer;
 *   3. "Approve" on the stress test opens the lockup, as a typed approval does;
 *   4. "Change something" hands the next move to the message box (FRI-1715);
 *   5. "Go ahead" starts the drawing: the opener is answered and the project
 *      moves to the directions;
 *   6. a second dead end stores its exits only after the directions, with
 *      "Finish in the kit" only where a kit exists and the kit can finish it;
 *      "Back to directions" lands at the directions with the person's last
 *      description as the drawing request, which is where `wayOut` says;
 *   7. the reply rows read from the stored conversation: Default while a
 *      move stands, Working once pressed, and exactly one Done row per
 *      answered line, the same when read again from stored data;
 *   8. the Hints: every step has three, from the approved copy.
 *
 * What it does not prove: the Convex mutation itself (its checks, that the
 * card is the right kind and the offer still stands, run only on Convex),
 * the page's clicks, or Gala's wording after a No. A typed yes is read by
 * Jev; this proves the button reaches the same request, not that Jev reads
 * every typed yes as one.
 */
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { handsOff } from "../../src/studio/handoff.ts";
import { repliesFor } from "../../src/studio/replies.ts";
import { loadPrompt } from "../prompt.ts";
import { symbolOpener } from "../stages/opener.ts";
import { stressTest } from "../stages/stress.ts";
import { STEP_FACTS } from "../stepFacts.ts";
import { pendingOffer, steer, type Offer } from "../steer.ts";
import { STEPS } from "../steps.ts";
import type { MemoryStore } from "../store-memory.ts";
import { Turn, type Exits } from "../turn.ts";
import { projectAt } from "./project.ts";

const prompt = await loadPrompt();
const h = createHarness(`Next-move buttons (prompt: ${prompt.source})`);

async function open(store: MemoryStore): Promise<Turn> {
  const turn = new Turn(store, prompt, new AbortController().signal);
  await turn.read();
  return turn;
}

/** The echo a press leaves (convex/lib/echo.ts): on the person's side, no text. */
function echo(store: MemoryStore, line: string): void {
  store.messages.push({ id: `echo-${store.messages.length}`, author: "visitor", kind: "action", text: null, artifact: { sending: line, sent: line, wakes: true }, upload: null });
}

const plain = (store: MemoryStore) => store.messages.map((message) => ({ id: message.id, author: message.author, kind: message.kind, artifact: message.artifact as Record<string, any> | null }));

function withOffer(store: MemoryStore): Offer {
  const card = store.latest("variationSet");
  const offer: Offer = {
    request: { typeface: null, nameAs: null, drawing: "three offset horizontal bars, the top one cut to a triangle", note: null },
    moveToOffer: "redraw the three variations with this: three offset horizontal bars, the top one cut to a triangle",
    afterMessages: store.messages.length,
  };
  card.artifact!.offer = offer;
  store.messages.push({ id: "offer-line", author: "gala", kind: "text", text: "I haven't drawn that yet. Should I redraw the three with that?", artifact: null, upload: null });
  return offer;
}

/** The act case `answerOffer`: the answer waits on the stored offer. */
function pressOffer(store: MemoryStore, answer: "yes" | "no"): void {
  const card = store.latest("variationSet");
  card.artifact = { ...card.artifact!, offer: { ...(card.artifact!.offer as Offer), pressed: answer } };
  echo(store, answer === "yes" ? "Yes, redraw" : "No");
}

// 1 and 2. The offer.

h.check("1. Yes, redraw runs the stored request exactly, clears the offer, and records yes", async () => {
  const store = projectAt("variations");
  const offer = withOffer(store);
  assertEqual(repliesFor(plain(store), {}, false)["offer-line"]?.view.state, "Default", "the row before the press");
  pressOffer(store, "yes");
  assertEqual(repliesFor(plain(store), {}, false)["offer-line"]?.view.state, "Working", "the row once pressed");
  const turn = await open(store);
  await steer(turn);
  assertEqual(turn.take(), { act: "redo", request: offer.request }, "what steering left");
  const card = store.latest("variationSet").artifact!;
  assertEqual(card.offer, null, "the offer on the card");
  assertEqual(card.answeredOffers, [{ afterMessages: offer.afterMessages, answer: "yes" }], "the answer kept");
});

h.check("2. No runs nothing, steers to a reply in words, clears the offer, and records no", async () => {
  const store = projectAt("variations");
  const offer = withOffer(store);
  pressOffer(store, "no");
  const turn = await open(store);
  await steer(turn);
  assertEqual(turn.take(), { act: "talk" }, "what steering left");
  const card = store.latest("variationSet").artifact!;
  assertEqual(card.offer, null, "the offer on the card");
  assertEqual(card.answeredOffers, [{ afterMessages: offer.afterMessages, answer: "no" }], "the answer kept");
  assert(pendingOffer(await open(store)) === null, "the offer still stands");
});

// 3 and 4. The stress test.

h.check("3. Approve on the stress test opens the lockup", async () => {
  const store = projectAt("stressTest");
  const card = store.latest("stressTest");
  assertEqual(card.artifact!.approved, false, "the card before the press");
  card.artifact = { ...card.artifact!, approved: true };
  echo(store, "Approve");
  const turn = await open(store);
  await steer(turn);
  assertEqual(await stressTest(turn), "continue", "the step's outcome");
  assertEqual(store.project.stage, "lockup", "the project's step");
});

h.check("4. Change something hands the next move to the message box", () => {
  assert(handsOff({ type: "changeMark" }), "Change something does not hand off");
});

// 5. The opener.

h.check("5. Go ahead answers the opener and starts the directions", async () => {
  const store = projectAt("symbolOpener");
  const card = store.latest("symbolOpener");
  assertEqual(repliesFor(plain(store), {}, true)[card.id]?.view.state, "Default", "Go ahead before the press");
  card.artifact = { ...card.artifact!, answered: "goAhead" };
  echo(store, "Go ahead");
  const turn = await open(store);
  await steer(turn);
  assertEqual(await symbolOpener(turn), "continue", "the step's outcome");
  assertEqual(store.project.stage, "directions", "the project's step");
  assertEqual(repliesFor(plain(store), {}, false)[card.id]?.view.state, "Done", "Go ahead after");
});

// 6. The exits.

/** A second dead end at a step: a words-only line already said there, and the person's description after it. */
function secondDeadEnd(stage: Parameters<typeof projectAt>[0], said: string): MemoryStore {
  const store = projectAt(stage);
  // The made-up project stops before the kit; at the kit, a kit card stands in for the built one.
  if (stage === "kit" && !store.messages.some((message) => message.kind === "kit")) store.messages.push({ id: "card-kit", author: "gala", kind: "kit", text: null, artifact: { say: "Your kit is ready." }, upload: null });
  store.messages.push({ id: "first-line", author: "gala", kind: "text", text: "I can't do that here.", artifact: null, upload: null });
  store.visitorSays(said);
  return store;
}

h.check("6a. exits are stored only after the directions, and Finish in the kit only where a kit exists and can finish it", async () => {
  for (const [stage, kitCanFinish, expect] of [
    ["directions", false, null],
    ["variations", false, false],
    ["lockup", true, false],
    ["stressTest", false, false],
    ["kit", true, true],
    ["kit", false, false],
  ] as const) {
    const turn = await open(secondDeadEnd(stage, "Make it two colors."));
    assert(turn.secondTime, `${stage}: not a second dead end`);
    const exits = turn.exitsFor(kitCanFinish);
    assertEqual(exits === null ? null : exits.stored.kitCanFinish, expect, `${stage}: exits`);
  }
});

h.check("6b. Back to directions lands at the directions with the person's last description", async () => {
  const description = "Make the top of the droplet green and the base purple.";
  const store = secondDeadEnd("lockup", description);
  const card = store.latest("lockup");
  const stored: Exits = { afterMessages: store.messages.length, kitCanFinish: false };
  card.artifact = { ...card.artifact!, exits: [stored] };
  store.messages.push({ id: "second-line", author: "gala", kind: "text", text: "I still can't do that. You can go back to the directions.", artifact: null, upload: null });
  const rows = repliesFor(plain(store), {}, false);
  assertEqual(rows["second-line"]?.view, { primary: "Back to directions", secondary: null, state: "Default", pressed: null }, "the row");
  card.artifact = { ...card.artifact!, exits: [{ ...stored, pressed: "directions" }] };
  echo(store, "Back to directions");
  const turn = await open(store);
  await steer(turn);
  assertEqual(store.project.stage, "directions", "the project's step");
  const next = turn.take();
  assertEqual(next?.act === "redo" ? next.request.drawing : null, description, "the request carried");
  assertEqual(repliesFor(plain(store), {}, false)["second-line"]?.view.state, "Done", "the row after");
  const wayOut = STEP_FACTS.variations.wayOut;
  assert(wayOut.includes("go back to the directions"), "the variations' way out is not the directions");
});

// 7. Done across a reload.

h.check("7. one Done row per answered line, read again from stored data", async () => {
  const store = projectAt("variations");
  withOffer(store);
  pressOffer(store, "no");
  await steer(await open(store));
  store.messages.push({ id: "reply-to-no", author: "gala", kind: "text", text: "Kept as they are.", artifact: null, upload: null });
  // A second offer on the same card, answered yes.
  const card = store.latest("variationSet");
  card.artifact = { ...card.artifact!, offer: { request: { typeface: null, nameAs: null, drawing: "a heavier base", note: null }, moveToOffer: "redraw with a heavier base", afterMessages: store.messages.length } };
  store.messages.push({ id: "offer-line-2", author: "gala", kind: "text", text: "Should I redraw them with a heavier base?", artifact: null, upload: null });
  pressOffer(store, "yes");
  await steer(await open(store));
  const reloaded = structuredClone(plain(store));
  const rows = repliesFor(reloaded, {}, false);
  const done = Object.entries(rows).filter(([, row]) => row.view.state === "Done").map(([id]) => id);
  // The opener in this made-up project was answered with go ahead, so its row is Done too.
  assertEqual(done.sort(), ["card-symbolOpener", "offer-line", "offer-line-2"], "Done rows");
  assert(rows["reply-to-no"] === undefined, "a plain line got buttons");
});

// 8. The hints.

h.check(`8. every one of ${STEPS.length} steps has three Hints from the approved copy`, () => {
  for (const step of STEPS) assertEqual(STEP_FACTS[step.stage].hints.length, 3, step.stage);
  assertEqual(STEP_FACTS.stressTest.hints[0], "Here's what the symbol should show", "the symbol steps' first hint");
  assertEqual(STEP_FACTS.kit.hints[2], "Start a new logo", "the kit's last hint");
});

await h.run();
