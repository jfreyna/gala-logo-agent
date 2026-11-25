/**
 * No step advances without an approval.
 *
 *   node --env-file-if-exists=/home/sprite/gala.env engine/checks/gate.check.ts
 *
 * It runs whole turns (the loop, steering and the stages) against the real
 * Jev and model, so it runs only on the Sprite. Storage is memory.
 *
 * For every step with a sign-off it runs three turns:
 *   1. a turn with nothing new from the person: the stage stays;
 *   2. a turn after ordinary feedback that approves nothing: the stage
 *      stays and the card is not signed off;
 *   3. a turn after the sign-off, as the button makes it: the stage moves
 *      to the very next step and stops there, with that step's card (or
 *      line) waiting and not signed off.
 *
 * What this proves: on these projects the only thing that moved a stage
 * was the sign-off, and it moved it by exactly one step. What it does not:
 * that no wording of feedback can be read as an approval (steering is one
 * model's reading; see steer.check.ts), or the steps that draw, which this
 * check stops short of: the turn after the symbol opener's sign-off, and
 * the one after a direction is picked, would call the image model.
 */
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { runTurn } from "../loop.ts";
import { assertComplete, loadPrompt } from "../prompt.ts";
import { symbolOpener } from "../stages/opener.ts";
import type { MemoryStore } from "../store-memory.ts";
import type { Stage } from "../store.ts";
import { Turn } from "../turn.ts";
import { projectAt, stepAfter } from "./project.ts";

const prompt = await loadPrompt();
assertComplete(prompt);

const turnOn = (store: MemoryStore) => runTurn(store, prompt, new AbortController().signal);

/** A step with a sign-off: its card, what signs it off, and how to tell the next step is waiting. */
type Gate = { step: Stage; kind: string; signOff: Record<string, unknown>; feedback: string; waiting: { kind: string; open: Record<string, unknown> } | null };

const GATES: Gate[] = [
  { step: "research", kind: "direction", signOff: { approved: true }, feedback: "Interesting, I had not thought about the neighbors that way.", waiting: { kind: "typeSet", open: { chosenId: null, saved: false } } },
  { step: "type", kind: "typeSet", signOff: { chosenId: "type-a", saved: true }, feedback: "These all feel a little more formal than I expected.", waiting: { kind: "wordmark", open: { approved: false } } },
  { step: "wordmark", kind: "wordmark", signOff: { approved: true }, feedback: "I like how sturdy that looks.", waiting: { kind: "symbolOpener", open: { answered: null } } },
  { step: "stressTest", kind: "stressTest", signOff: { approved: true }, feedback: "Good to know it holds up small.", waiting: { kind: "lockup", open: { approved: false } } },
  { step: "lockup", kind: "lockup", signOff: { approved: true }, feedback: "They sit well together.", waiting: { kind: "colorPicker", open: { saved: false } } },
];

const h = createHarness(`The approval gate (prompt: ${prompt.source})`);

for (const gate of GATES) {
  const next = stepAfter(gate.step);

  h.check(`${gate.step}: a turn with nothing new from the person leaves the stage where it is`, async () => {
    const store = projectAt(gate.step);
    const cards = store.messages.length;
    assertEqual(await turnOn(store), "done", "the turn");
    assertEqual(store.project.stage, gate.step, "the stage");
    assertEqual(store.messages.length, cards, "messages in the conversation");
  });

  h.check(`${gate.step}: feedback that approves nothing leaves the stage where it is and the card not signed off`, async () => {
    const store = projectAt(gate.step);
    const card = JSON.stringify(store.latest(gate.kind).artifact);
    store.visitorSays(gate.feedback);
    assertEqual(await turnOn(store), "done", "the turn");
    assertEqual(store.project.stage, gate.step, "the stage");
    assertEqual(JSON.stringify(store.latest(gate.kind).artifact), card, `the ${gate.kind} card`);
    assert(!store.messages.some((message) => message.kind === gate.waiting!.kind && message.id !== `card-${gate.waiting!.kind}`), `a ${gate.waiting!.kind} card was shown`);
  });

  h.check(`${gate.step}: the sign-off moves the stage to ${next} and stops there, waiting`, async () => {
    const store = projectAt(gate.step);
    Object.assign(store.latest(gate.kind).artifact!, gate.signOff);
    assertEqual(await turnOn(store), "done", "the turn");
    assertEqual(store.project.stage, next, "the stage");
    const waiting = store.latest(gate.waiting!.kind).artifact!;
    for (const [key, value] of Object.entries(gate.waiting!.open)) assertEqual(waiting[key], value, `${gate.waiting!.kind}.${key}`);
  });
}

// The symbol opener's sign-off starts the drawing, so its third turn is checked on the stage alone, which stops before the image model.
h.check("symbolOpener: a turn with nothing new from the person leaves the stage where it is", async () => {
  const store = projectAt("symbolOpener");
  const cards = store.messages.length;
  assertEqual(await turnOn(store), "done", "the turn");
  assertEqual(store.project.stage, "symbolOpener", "the stage");
  assertEqual(store.messages.length, cards, "messages in the conversation");
});

h.check("symbolOpener: feedback that describes no idea and does not say go ahead leaves the stage where it is", async () => {
  const store = projectAt("symbolOpener");
  store.visitorSays("Those are nice starting points.");
  assertEqual(await turnOn(store), "done", "the turn");
  assertEqual(store.project.stage, "symbolOpener", "the stage");
  assertEqual(store.latest("symbolOpener").artifact!.answered, null, "answered");
  assert(!store.messages.some((message) => message.kind === "conceptSet"), "directions were drawn");
});

h.check("symbolOpener: go ahead moves the stage to directions, by exactly one step", async () => {
  const store = projectAt("symbolOpener");
  store.latest("symbolOpener").artifact!.answered = "goAhead";
  const turn = new Turn(store, prompt, new AbortController().signal);
  await turn.read();
  assertEqual(await symbolOpener(turn), "continue", "the step's outcome");
  assertEqual(store.project.stage, "directions", "the stage");
});

await h.run();
