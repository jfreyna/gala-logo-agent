/**
 * Reaching earlier cards: a pick or a name on any round of the
 * current step, a redraw from the right mark, a pick with a change, and an
 * echo that settles.
 *
 *   node --experimental-strip-types --no-warnings engine/checks/earlier-cards.check.ts
 *
 * Steering, Gala's lines and the replay call Jev and the models, so the
 * whole check runs on the Sprite. Storage is memory.
 *
 * What this proves:
 *   1. a Pick on an earlier round counts and moves on, for directions,
 *      variations and colorways: the round is brought back as the newest
 *      card with the pick, Gala's line names the mark, and the stage moves;
 *      a colorway round in colors the person has since changed does not
 *      count, and the old pick from before the stress test is never a round
 *      of the step's new visit;
 *   2. naming a mark from an earlier round with a change sets the redraw's
 *      starting mark to that real card's mark; naming it with no change
 *      ("pull that one up") brings that round back unpicked and draws
 *      nothing; a pick by name on an earlier round picks that round;
 *   3. the starting mark of a redraw, in order: the named mark, the mark the
 *      newest round started from, the picked variation coming back from the
 *      stress test or from a later step, the chosen direction;
 *   4. at the variations, a pick with a change draws from the picked mark
 *      and saves no pick, so the step waits for the new round;
 *   5. the echo settles to Sent once the turn it asked for ends, with or
 *      without a reply;
 *   6. the Ninth-Floor sequence, replayed end to end with the scripted
 *      person: the starting mark of every round drawn, and the 2:16 pm
 *      "pull that one up" bringing the round back with nothing drawn.
 *
 * What it does not prove: that the drawings follow the request or look
 * good (that is a person's to judge), or that Jev reads every wording
 * the same way: each steering answer is one model's reading of one message.
 * Gala's line naming the mark is checked for the name only, not its
 * quality. The replay's seed marks are simple shapes drawn in code, not the
 * test walk's drawings.
 */
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { rasterize } from "../../kit/src/render.ts";
import { echoState } from "../../src/studio/echoState.ts";
import { runTurn } from "../loop.ts";
import { assertComplete, loadPrompt } from "../prompt.ts";
import { roundsOf } from "../rounds.ts";
import { colorways } from "../stages/color.ts";
import { directions, startingMark, variations } from "../stages/directions.ts";
import { WORKING } from "../lines.ts";
import { goBack, optionsOnScreen, steer } from "../steer.ts";
import { MemoryStore } from "../store-memory.ts";
import type { StoredMessage } from "../store.ts";
import { Turn } from "../turn.ts";
import { projectAt } from "./project.ts";

const prompt = await loadPrompt();
assertComplete(prompt);

async function open(store: MemoryStore): Promise<Turn> {
  const turn = new Turn(store, prompt, new AbortController().signal);
  await turn.read();
  return turn;
}

const h = createHarness(`Reaching earlier cards (prompt: ${prompt.source})`);

/** A second round of the step's card, after the one `projectAt` wrote, with its own marks. */
function addRound(store: MemoryStore, kind: "conceptSet" | "variationSet", names: string[], extra: Record<string, unknown> = {}): StoredMessage {
  const letters = kind === "conceptSet" ? ["A", "B", "C"] : ["1", "2", "3"];
  const prefix = kind === "conceptSet" ? "mark2" : "var2";
  const card: StoredMessage = {
    id: `card-${kind}-2`,
    author: "gala",
    kind,
    text: null,
    artifact: {
      say: "Three more.",
      concepts: names.map((name, index) => ({ id: `${prefix}-${index + 1}`, letter: letters[index], name, rationale: "", markFileId: `file-${prefix}-${index + 1}`, sourceFileId: `file-${prefix}-${index + 1}`, checks: [] })),
      chosenId: null,
      ...extra,
    },
    upload: null,
  };
  store.visitorSays("Try again.");
  store.messages.push(card);
  return card;
}

/** The project at the colorways, with two rounds in the same colors. */
function colorwaysProject(): MemoryStore {
  const store = projectAt("lockup");
  store.latest("lockup").artifact!.approved = true;
  const colors = { primary: "#B83A1B", secondary: "#F2E6D0", tertiary: null };
  store.messages.push({ id: "card-picker", author: "gala", kind: "colorPicker", text: null, artifact: { say: "Pick your colors.", colors, saved: true }, upload: null });
  const round = (id: string, names: string[], roundColors = colors) =>
    store.messages.push({
      id,
      author: "gala",
      kind: "colorwaySet",
      text: null,
      artifact: {
        say: "Three colorways.",
        brandName: "Ember & Rye",
        family: "Young Serif",
        letterSpacingEm: 0,
        colors: roundColors,
        colorways: names.map((name, index) => ({ id: `${id}-${index + 1}`, letter: ["A", "B", "C"][index], name, rationale: "", ground: "#FFFFFF", markFileId: "file-2", wordmarkColor: "#B83A1B", roles: [], assignment: { mark: "primary", wordmark: "primary", ground: "white" } })),
        chosenId: null,
      },
      upload: null,
    });
  round("cw1", ["Brick Lead", "Cream Ground", "Quiet"]);
  store.visitorSays("Try other ones.");
  round("cw2", ["Ember Glow", "Night Oven", "Soft Crust"]);
  store.project.stage = "colorways";
  return store;
}

// 1. A Pick on an earlier round counts and moves on.

h.check("1a. a Pick on the earlier variation round brings it back with the pick, names the mark, and moves on to the stress test", async () => {
  const store = projectAt("variations");
  addRound(store, "variationSet", ["Ember, wide", "Ember, tall", "Ember, round"]);
  store.messages.find((message) => message.id === "card-variationSet")!.artifact!.chosenId = "var-2";
  const outcome = await variations(await open(store));
  assertEqual(outcome, "continue", "the step's outcome");
  const newest = store.latest("variationSet");
  assertEqual(newest.artifact!.chosenId, "var-2", "the newest card's pick");
  assertEqual(newest.artifact!.broughtBack?.roundsAfterIt, 1, "how many rounds came after the picked one");
  assertEqual(store.project.stage, "stressTest", "the stage");
  assertEqual(store.choices.find((choice) => choice.step === "variations")?.chosen, "var-2", "the recorded choice");
  assert(/heavy/i.test(newest.artifact!.say), `Gala's line does not name the mark: "${newest.artifact!.say}"`);
});

h.check("1b. a Pick on the earlier direction round counts the same way and moves on to the variations", async () => {
  const store = projectAt("directions");
  addRound(store, "conceptSet", ["Crust", "Steam", "Grain"]);
  store.messages.find((message) => message.id === "card-conceptSet")!.artifact!.chosenId = "mark-b";
  assertEqual(await directions(await open(store)), "continue", "the step's outcome");
  assertEqual(store.latest("conceptSet").artifact!.chosenId, "mark-b", "the newest card's pick");
  assertEqual(store.project.stage, "variations", "the stage");
  assert(/peel/i.test(store.latest("conceptSet").artifact!.say), "Gala's line does not name the mark");
});

h.check("1c. a Pick on the earlier colorway round counts the same way and moves on to the kit", async () => {
  const store = colorwaysProject();
  store.messages.find((message) => message.id === "cw1")!.artifact!.chosenId = "cw1-2";
  assertEqual(await colorways(await open(store)), "continue", "the step's outcome");
  assertEqual(store.latest("colorwaySet").artifact!.chosenId, "cw1-2", "the newest card's pick");
  assertEqual(store.project.stage, "kit", "the stage");
  assert(/cream/i.test(store.latest("colorwaySet").artifact!.say), "Gala's line does not name the colorway");
});

h.check("1d. a pick on a colorway round in colors the person has since changed is not a round of the step", async () => {
  const store = colorwaysProject();
  store.messages.find((message) => message.id === "cw1")!.artifact!.colors = { primary: "#123456", secondary: "#FFFFFF", tertiary: null };
  store.messages.find((message) => message.id === "cw1")!.artifact!.chosenId = "cw1-1";
  const turn = await open(store);
  assertEqual(roundsOf(turn, "colorwaySet").map((round) => round.id).join(","), "cw2", "the step's rounds");
  assertEqual(await colorways(turn), "wait", "the step's outcome");
  assertEqual(store.project.stage, "colorways", "the stage");
});

h.check("1e. back from the stress test, the variation picked before it is not a round of the new visit", async () => {
  const store = projectAt("stressTest");
  store.project.stage = "variations";
  assertEqual(roundsOf(await open(store), "variationSet").length, 0, "the step's rounds");
});

// 2. Naming an earlier mark.

h.check("2a. naming a mark on the earlier round with a change redraws from that mark", async () => {
  const store = projectAt("variations");
  addRound(store, "variationSet", ["Ember, wide", "Ember, tall", "Ember, round"]);
  store.visitorSays("Go back to Hearth, heavy from the round before, and make its arch taller.");
  const turn = await open(store);
  await steer(turn);
  const next = turn.take();
  assertEqual(next?.act, "redo", "what steering left for the step");
  assertEqual(next?.act === "redo" ? next.request.startFrom?.id : null, "var-2", "the starting mark");
  assertEqual(store.project.stage, "variations", "the stage");
});

h.check("2b. asking for the earlier mark by name, with no change, reaches it and never redraws", async () => {
  const store = projectAt("variations");
  addRound(store, "variationSet", ["Ember, wide", "Ember, tall", "Ember, round"]);
  store.visitorSays("We want the one from the earlier round called Hearth, heavy.");
  const turn = await open(store);
  await steer(turn);
  const next = turn.take();
  // Read as a pick by name, it is that round's pick; read as asking for it back, the round comes back unpicked. Never three new ones.
  const picked = store.messages.find((message) => message.id === "card-variationSet")!.artifact!.chosenId;
  const newest = store.latest("variationSet").artifact!;
  const back = newest.broughtBack !== undefined && newest.chosenId === null && newest.concepts.some((concept: { id: string }) => concept.id === "var-2");
  assert(next?.act !== "redo", `steering redraws: ${JSON.stringify(next)}`);
  assert(picked === "var-2" || back, `the earlier mark was not reached (steering left ${JSON.stringify(next)})`);
});

h.check("2d. \"Can you pull up the one that had Hearth, heavy?\" brings that round back unpicked and draws nothing", async () => {
  const store = projectAt("variations");
  addRound(store, "variationSet", ["Ember, wide", "Ember, tall", "Ember, round"]);
  store.visitorSays("Can you pull up the one that had Hearth, heavy?");
  const turn = await open(store);
  await steer(turn);
  assertEqual(await variations(turn), "wait", "the step's outcome");
  const cards = store.messages.filter((message) => message.kind === "variationSet");
  assertEqual(cards.length, 3, "variation cards (two rounds and the one brought back)");
  const newest = cards[cards.length - 1]!.artifact!;
  assert(newest.concepts.some((concept: { id: string }) => concept.id === "var-2"), "the newest card is not the round with Hearth, heavy");
  assertEqual(newest.chosenId, null, "the brought-back round's pick");
  assertEqual(newest.broughtBack?.roundsAfterIt, 1, "where the brought-back round sat");
  assert(!store.statuses.includes(WORKING.variations), "something was drawn");
  assertEqual(store.project.stage, "variations", "the stage");
});

h.check("2c. the options on screen span every round, the earlier one named with its round", async () => {
  const store = projectAt("variations");
  addRound(store, "variationSet", ["Ember, wide", "Ember, tall", "Ember, round"]);
  const onScreen = optionsOnScreen(await open(store))!;
  assertEqual(onScreen.options.length, 6, "options");
  assertEqual(onScreen.options.slice(0, 3).map((option) => option.key).join(","), "1,2,3", "the newest round's keys");
  assert(onScreen.options.some((option) => option.key === "var-2" && /round 1 of 2/.test(option.label)), "the earlier round's option is not named with its round");
});

// 3. The starting mark of a redraw.

h.check("3a. a named mark comes first", async () => {
  const store = projectAt("variations");
  addRound(store, "variationSet", ["Ember, wide", "Ember, tall", "Ember, round"], { startedFrom: { id: "var-1", name: "Hearth, narrow", markFileId: "file-1", sourceFileId: "file-1" } });
  const start = startingMark(await open(store), "variationSet", { typeface: null, nameAs: null, drawing: "taller", note: null, startFrom: { id: "var2-3", name: "Ember, round", markFileId: "f", sourceFileId: "f" } });
  assertEqual(start?.id, "var2-3", "the starting mark");
});

h.check("3b. else the mark the step's newest round started from (a refinement keeps refining the same mark)", async () => {
  const store = projectAt("variations");
  addRound(store, "variationSet", ["Ember, wide", "Ember, tall", "Ember, round"], { startedFrom: { id: "var-1", name: "Hearth, narrow", markFileId: "file-1", sourceFileId: "file-1" } });
  assertEqual(startingMark(await open(store), "variationSet", null)?.id, "var-1", "the starting mark");
});

h.check("3c. else, back from the stress test, the variation that was picked", async () => {
  const store = projectAt("stressTest");
  store.project.stage = "variations";
  assertEqual(startingMark(await open(store), "variationSet", null)?.id, "var-2", "the starting mark");
});

h.check("3d. else, going back to the variations from a later step, the variation that was picked", async () => {
  const store = projectAt("lockup");
  const turn = await open(store);
  await goBack(turn, "variations", null);
  assertEqual(store.project.stage, "variations", "the stage");
  assertEqual(startingMark(turn, "variationSet", null)?.id, "var-2", "the starting mark");
});

h.check("3e. else the chosen direction", async () => {
  const store = projectAt("variations", { withCard: false });
  assertEqual(startingMark(await open(store), "variationSet", null)?.id, "mark-a", "the starting mark");
});

h.check("3f. the first directions start from nothing", async () => {
  const store = projectAt("directions", { withCard: false });
  assertEqual(startingMark(await open(store), "conceptSet", null), null, "the starting mark");
});

// 4. Pick with a change at the variations.

h.check("4. at the variations, a pick with a change draws from the picked mark and saves no pick", async () => {
  const store = projectAt("variations");
  store.visitorSays("Make number 2 with a pointy tip at the top of the arch.");
  const turn = await open(store);
  await steer(turn);
  const next = turn.take();
  assertEqual(next?.act, "redo", "what steering left for the step");
  assertEqual(next?.act === "redo" ? next.request.startFrom?.id : null, "var-2", "the starting mark");
  assert(next?.act === "redo" && (next.request.drawing !== null || next.request.note !== null), "the change was dropped");
  assertEqual(store.latest("variationSet").artifact!.chosenId, null, "the card's pick");
  assertEqual(store.project.stage, "variations", "the stage");
});

// 5. The echo.

h.check("5. the echo settles once the turn it asked for ends, with or without a reply", () => {
  const visitor = { author: "visitor" };
  const gala = { author: "gala" };
  assertEqual(echoState({ wakes: true, later: [], working: null, waitingOnGala: true }), "Sending", "owed, no turn yet");
  assertEqual(echoState({ wakes: true, later: [], working: "Drawing three variations", waitingOnGala: false }), "Sent", "while the turn works");
  assertEqual(echoState({ wakes: true, later: [], working: null, waitingOnGala: false }), "Sent", "the turn ended with no reply");
  assertEqual(echoState({ wakes: true, later: [gala], working: null, waitingOnGala: false }), "Sent", "Gala answered");
  assertEqual(echoState({ wakes: true, later: [visitor], working: null, waitingOnGala: true }), "Sent", "the person wrote again");
  assertEqual(echoState({ wakes: false, later: [], working: null, waitingOnGala: true }), "Sent", "an action that wakes no one");
});

// 6. The Ninth-Floor sequence.

/** A simple black mark on white, drawn in code, as the image model's output would be. */
function seedMark(shapes: string): Uint8Array {
  return rasterize(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#FFFFFF"/>${shapes}</svg>`, 512);
}
const GRID = [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => `<rect x="${86 + col * 120}" y="${86 + row * 120}" width="100" height="100" fill="#000000"/>`)).join("");
const BARS = [0, 1, 2].map((row) => `<rect x="86" y="${126 + row * 100}" width="340" height="60" fill="#000000"/>`).join("");

h.check("6. Ninth-Floor replay: every round starts from the mark the person was working on, never the direction", async () => {
  const store = projectAt("stressTest");
  const save = (bytes: Uint8Array) => {
    const id = `seed-${store.files.size + 1}`;
    store.files.set(id, { bytes, contentType: "image/png" });
    return id;
  };
  // The direction is the nine-square grid (Corner Grid); the picked variation is the bars (Wide Channels).
  const grid = save(seedMark(GRID));
  const bars = save(seedMark(BARS));
  const direction = store.latest("conceptSet").artifact!;
  direction.concepts[0] = { ...direction.concepts[0], name: "Corner Grid", markFileId: grid, sourceFileId: grid };
  const variation = store.latest("variationSet").artifact!;
  variation.concepts[1] = { ...variation.concepts[1], name: "Wide Channels", markFileId: bars, sourceFileId: bars };
  const stress = store.latest("stressTest").artifact!;
  Object.assign(stress, { markFileId: bars, sourceFileId: bars });

  const signal = () => new AbortController().signal;
  const startOf = () => store.latest("variationSet").artifact!.startedFrom?.id ?? null;
  const rounds: string[] = [];

  // A refinement from the stress test: the first round starts from Wide Channels.
  store.visitorSays("Move the bottom bar half a step to the left so the three bars are staggered.");
  assertEqual(await runTurn(store, prompt, signal()), "done", "turn 1");
  assertEqual(store.project.stage, "variations", "the stage after turn 1");
  const first = store.latest("variationSet");
  rounds.push(`round 1 from ${first.artifact!.startedFrom?.name}`);
  assertEqual(startOf(), "var-2", "round 1's starting mark (Wide Channels)");

  // "They all look the same": the next round still starts from Wide Channels, not from the grid.
  store.visitorSays("All three look the same as before; the bottom bar has not moved. Shift it further to the left.");
  assertEqual(await runTurn(store, prompt, signal()), "done", "turn 2");
  rounds.push(`round 2 from ${store.latest("variationSet").artifact!.startedFrom?.name}`);
  assertEqual(startOf(), "var-2", "round 2's starting mark (Wide Channels)");

  const older = first.artifact!.concepts[1] as { id: string; name: string; markFileId: string };

  // 2:16 pm, the test walk's words: "pull that one up", no change. That round comes back unpicked, and nothing new is drawn.
  const drawnBefore = store.statuses.filter((status) => status === WORKING.variations).length;
  store.visitorSays(`We want the one from an earlier round called ${older.name}, not three new ones. Can you pull that one up? These three new ones are rejected.`);
  assertEqual(await runTurn(store, prompt, signal()), "done", "the 2:16 pm turn");
  const broughtBack = store.latest("variationSet").artifact!;
  assert(broughtBack.concepts.some((concept: { id: string }) => concept.id === older.id), `the round with ${older.name} was not brought back`);
  assertEqual(broughtBack.chosenId, null, "the brought-back round's pick");
  assertEqual(store.statuses.filter((status) => status === WORKING.variations).length, drawnBefore, "rounds drawn by the 2:16 pm turn");
  rounds.push(`round 1 brought back (${older.name}), nothing drawn`);

  // A Pick on the older card itself (like Half Step): it counts, is brought back with the pick, and the stress test runs on it.
  store.messages.find((message) => message.id === first.id)!.artifact!.chosenId = older.id;
  store.messages.push({ id: "echo-pick", author: "visitor", kind: "action", text: null, artifact: { sending: `Picking ${older.name}`, sent: `Picked ${older.name}`, wakes: true }, upload: null });
  assertEqual(await runTurn(store, prompt, signal()), "done", "turn 3");
  assertEqual(store.latest("variationSet").artifact!.chosenId, older.id, "the brought-back card's pick");
  assertEqual(store.latest("stressTest").artifact!.markFileId, older.markFileId, "the mark the stress test ran on");
  assertEqual(store.project.stage, "stressTest", "the stage after turn 3");

  // "Go back to the one that had Half Step", with a change: the next round starts from that mark.
  store.visitorSays(`Can you go back to the one that had ${older.name}? Make its top bar shorter.`);
  assertEqual(await runTurn(store, prompt, signal()), "done", "turn 4");
  assertEqual(store.project.stage, "variations", "the stage after turn 4");
  rounds.push(`round 3 from ${store.latest("variationSet").artifact!.startedFrom?.name}`);
  assertEqual(startOf(), older.id, `round 3's starting mark (${older.name})`);
  console.log(`        ${rounds.join("; ")}`);
});

await h.run();
