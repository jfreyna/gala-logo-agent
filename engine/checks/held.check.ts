/**
 * A request about a later step is held, and the stage does not move.
 *
 *   node --env-file-if-exists=/home/sprite/gala.env engine/checks/held.check.ts
 *
 * It calls Jev and the model, so it runs only on the Sprite. Storage is
 * memory. Each line's scores print as Gala's log line does, never the
 * message.
 *
 * What this proves: on these lines, at these steps, the request is stored
 * for a later step in the person's own words, nothing on the current card
 * changes, the stage stays, and the step is told to say where the project
 * is. It also proves the other side: a request for the current step is not
 * held. Two lines that Jev scores near the middle are checked on the rule
 * alone (held or one question, never acted on). What it does not: other wordings, or which later step a request is
 * filed under beyond the group named here. Each answer is one model's
 * reading, so a pass is evidence, not a guarantee.
 */
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { assertComplete, loadPrompt } from "../prompt.ts";
import { steer } from "../steer.ts";
import { stepIndex } from "../steps.ts";
import type { Stage } from "../store.ts";
import { Turn } from "../turn.ts";
import { projectAt } from "./project.ts";

const prompt = await loadPrompt();
assertComplete(prompt);

/** A line said at a step, and the steps its request may be kept for. */
const HELD: { at: Stage; line: string; keptFor: Stage[] }[] = [
  { at: "wordmark", line: "Can the symbol be a paintbrush?", keptFor: ["symbolOpener", "directions", "variations"] },
  { at: "type", line: "For the icon I keep picturing a little flame inside an arch.", keptFor: ["symbolOpener", "directions", "variations"] },
  { at: "wordmark", line: "When we get to color, I want a deep brick red with a warm cream.", keptFor: ["pickColors", "colorways"] },
  { at: "directions", line: "Later on, put the name underneath the symbol rather than beside it.", keptFor: ["lockup"] },
  { at: "research", line: "Can the logo be blue?", keptFor: ["pickColors", "colorways"] },
  { at: "research", line: "I'd love a little fox as the icon.", keptFor: ["symbolOpener", "directions", "variations"] },
];

/**
 * Lines Jev has scored inside the unsure band on some runs. Either answer
 * keeps the rule: the request is held for its step, or Gala asks one
 * question; it is never acted on, and the stage stays. The check prints
 * which happened.
 */
const HELD_OR_ASKED: { at: Stage; line: string; keptFor: Stage[] }[] = [
  { at: "research", line: "I already know I want the name set in Alata.", keptFor: ["type"] },
  { at: "type", line: "Once a typeface is picked, set the name in all capitals.", keptFor: ["wordmark"] },
];

/** Lines that belong to the step they are said at: nothing is held. */
const NOT_HELD: { at: Stage; line: string }[] = [
  { at: "wordmark", line: "Make it all caps." },
  { at: "directions", line: "Can you try B with a thicker outline?" },
  { at: "wordmark", line: "I like how sturdy that looks." },
];

const h = createHarness(`Held requests (prompt: ${prompt.source})`);

for (const entry of HELD) {
  h.check(`at ${entry.at}, "${entry.line}" is held for ${entry.keptFor.join(" or ")}, and the stage stays`, async () => {
    const store = projectAt(entry.at);
    const before = JSON.stringify(store.messages);
    store.visitorSays(entry.line);
    const turn = new Turn(store, prompt, new AbortController().signal);
    await turn.read();
    await steer(turn);
    const left = turn.take();
    assertEqual(store.project.stage, entry.at, "the stage");
    assertEqual(store.held.length, 1, "requests held");
    assert(entry.keptFor.includes(store.held[0]!.step), `held for ${store.held[0]!.step}`);
    assert(stepIndex(store.held[0]!.step) > stepIndex(entry.at), "held for a step that is not later");
    assert(store.held[0]!.text.trim() !== "", "the held request is empty");
    assertEqual(left?.act, "held", "what the step was told to do");
    // Every card is as it was: nothing was picked, approved or changed.
    assertEqual(JSON.stringify(store.messages.slice(0, -1)), before, "the cards");
    console.log(`  held for ${store.held[0]!.step}, ${store.held[0]!.text.length} characters`);
  });
}

for (const entry of HELD_OR_ASKED) {
  h.check(`at ${entry.at}, "${entry.line}" is held for ${entry.keptFor.join(" or ")} or gets one question, and the stage stays`, async () => {
    const store = projectAt(entry.at);
    const typeCard = JSON.stringify(store.messages.find((message) => message.kind === "typeSet")?.artifact?.directions ?? null);
    store.visitorSays(entry.line);
    const turn = new Turn(store, prompt, new AbortController().signal);
    await turn.read();
    await steer(turn);
    const left = turn.take();
    assertEqual(store.project.stage, entry.at, "the stage");
    assert(left?.act === "held" || left?.act === "ask" || left?.act === "redo", `the step was told ${left?.act ?? "nothing"}`);
    if (left?.act === "held") assert(entry.keptFor.includes(store.held[0]!.step), `held for ${store.held[0]!.step}`);
    // Whatever was read, no typeface was chosen or swapped by it.
    assertEqual(JSON.stringify(store.messages.find((message) => message.kind === "typeSet")?.artifact?.directions ?? null), typeCard, "the typefaces on the type card");
    console.log(`  ${left?.act === "held" ? `held for ${store.held[0]!.step}` : left?.act === "ask" ? "one question" : "taken as a change to this step"}`);
  });
}

for (const entry of NOT_HELD) {
  h.check(`at ${entry.at}, "${entry.line}" belongs to this step and is not held`, async () => {
    const store = projectAt(entry.at);
    store.visitorSays(entry.line);
    const turn = new Turn(store, prompt, new AbortController().signal);
    await turn.read();
    await steer(turn);
    assertEqual(store.held.length, 0, "requests held");
    assertEqual(store.project.stage, entry.at, "the stage");
    assert(turn.take()?.act !== "held", "the step was told the request was held");
  });
}

h.check("a pick with a request for a later step in the same message does both: the wordmark is approved and the idea is held", async () => {
  const store = projectAt("wordmark");
  store.visitorSays("Use this wordmark. And for the symbol, I want a paintbrush.");
  const turn = new Turn(store, prompt, new AbortController().signal);
  await turn.read();
  await steer(turn);
  assertEqual(store.latest("wordmark").artifact!.approved, true, "the wordmark approved");
  assertEqual(store.held.length, 1, "requests held");
  assert(["symbolOpener", "directions", "variations"].includes(store.held[0]!.step), `held for ${store.held[0]!.step}`);
});

await h.run();
