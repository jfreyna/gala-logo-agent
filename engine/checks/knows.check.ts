/**
 * What Gala knows at each step (FRI-1720): one facts table, given to every
 * words-only reply; a can't-do reply with the closest move and, only for a
 * finishing touch on a kept mark, the kit line; a second words-only reply
 * given the way out; and a change at the colorways sent to the step whose
 * work it is, with the colors kept.
 *
 *   node --experimental-strip-types --no-warnings engine/checks/knows.check.ts
 *
 * Steering and the replies call Jev and the models, so this runs on the
 * Sprite. Storage is memory. Nothing is drawn.
 *
 * What this proves:
 *   1. every step in steps.ts has a row (something it can do, and a way
 *      out), and the kit's contents are listed;
 *   2. a words-only reply is given `canDo`, `cantDo` and `kitHolds` for its
 *      step, and `secondTime` with `wayOut` when Gala's last message was a
 *      words-only reply at the same step;
 *   3. the Ninth-Floor screenshot, the 12:23 resize and the 12:27 two-color
 *      requests each get a can't-do reply with a closest move from the
 *      step's own list; `kitCanFinish` is yes for the resize and the two
 *      colors and no for the screenshot; a mark the person rejects never
 *      gets the kit line;
 *   4. a change to the symbol at the colorways goes back to the variations
 *      with the request, starting from the picked variation, with the saved
 *      colors kept; when the color step opens again they are still saved.
 *
 * What it does not prove: that every wording of a can't-do request is
 * caught (each Jev answer is one model's reading of one message), or the
 * quality of Gala's reply: the reply itself is not graded here.
 */
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { rasterize } from "../../kit/src/render.ts";
import { assertComplete, loadPrompt } from "../prompt.ts";
import { openColors } from "../stages/color.ts";
import { startingMark, variations } from "../stages/directions.ts";
import { steer } from "../steer.ts";
import { KIT_HOLDS, KIT_LINE, STEP_FACTS } from "../stepFacts.ts";
import { STEPS } from "../steps.ts";
import type { MemoryStore } from "../store-memory.ts";
import { Turn } from "../turn.ts";
import { projectAt } from "./project.ts";

const prompt = await loadPrompt();
assertComplete(prompt);

async function open(store: MemoryStore): Promise<Turn> {
  const turn = new Turn(store, prompt, new AbortController().signal);
  await turn.read();
  return turn;
}

const h = createHarness(`What Gala knows (prompt: ${prompt.source})`);

const COLORS = { primary: "#B83A1B", secondary: "#F2E6D0", tertiary: null };

/** The project at the colorways: every step before signed off, the colors saved, one round of colorways. */
function atColorways(): MemoryStore {
  const store = projectAt("lockup");
  store.latest("lockup").artifact!.approved = true;
  store.messages.push({ id: "card-picker", author: "gala", kind: "colorPicker", text: null, artifact: { say: "Pick your colors.", colors: COLORS, saved: true }, upload: null });
  store.messages.push({
    id: "card-colorways",
    author: "gala",
    kind: "colorwaySet",
    text: null,
    artifact: {
      say: "Three colorways.",
      brandName: "Ember & Rye",
      family: "Young Serif",
      letterSpacingEm: 0,
      colors: COLORS,
      colorways: ["Brick Lead", "Cream Ground", "Quiet"].map((name, index) => ({ id: `cw-${index + 1}`, letter: ["A", "B", "C"][index], name, rationale: "", ground: "#FFFFFF", markFileId: "file-2", wordmarkColor: "#B83A1B", roles: [], assignment: { mark: "primary", wordmark: "primary", ground: "white" } })),
      chosenId: null,
    },
    upload: null,
  });
  store.project.stage = "colorways";
  return store;
}

/** Steers one message and returns what steering left for the step. */
async function steered(store: MemoryStore, text: string, upload?: { bytes: Uint8Array; contentType: string; fileName: string }) {
  store.visitorSays(text, upload);
  const turn = await open(store);
  await steer(turn);
  return { turn, next: turn.take() };
}

// 1. The table.

h.check("1. every step has a row: something it can do and a way out; the kit's contents are listed", () => {
  for (const step of STEPS) {
    const row = STEP_FACTS[step.stage];
    assert(row !== undefined, `${step.stage} has no row`);
    assert(row.canDo.length > 0, `${step.stage} can do nothing`);
    assert(row.wayOut.trim() !== "", `${step.stage} has no way out`);
    for (const item of row.cantDo) assert(item.what !== "" && item.reason !== "", `${step.stage} has a can't-do item with no words`);
  }
  assertEqual(Object.keys(STEP_FACTS).length, STEPS.length, "rows");
  assert(KIT_HOLDS.length > 0, "the kit holds nothing");
});

// 2. The facts a words-only reply gets.

h.check("2. a words-only reply gets canDo, cantDo and kitHolds, and secondTime with the way out after a words-only reply at the same step", async () => {
  const store = projectAt("variations");
  store.visitorSays("What do you think of number 3?");
  const turn = await open(store);
  const seen: Record<string, unknown>[] = [];
  const think = turn.think.bind(turn);
  turn.think = (async (options: Parameters<Turn["think"]>[0]) => {
    seen.push(options.facts);
    return think(options);
  }) as Turn["think"];
  turn.steer({ act: "talk" });
  await variations(turn);
  const first = seen[0]!;
  assertEqual(JSON.stringify(first.canDo), JSON.stringify(STEP_FACTS.variations.canDo), "canDo");
  assertEqual((first.cantDo as unknown[]).length, STEP_FACTS.variations.cantDo.length, "cantDo");
  assertEqual(JSON.stringify(first.kitHolds), JSON.stringify(KIT_HOLDS), "kitHolds");
  assertEqual(first.secondTime, undefined, "secondTime on the first reply");

  // The same again: Gala's last message is now a words-only reply at the variations.
  store.visitorSays("And number 1?");
  const again = await open(store);
  assertEqual(again.secondTime, true, "secondTime on the second reply");
});

// 3. Can't-do replies.

h.check("3a. the Ninth-Floor screenshot gets a can't-do reply with a move, and no kit line", async () => {
  const screenshot = rasterize(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#FFFFFF"/><rect x="86" y="200" width="340" height="60" fill="#000000"/></svg>`, 512);
  const { next } = await steered(projectAt("variations"), "Here's a screenshot of the one I want. Can you look at it and use it?", { bytes: screenshot, contentType: "image/png", fileName: "screenshot.png" });
  assertEqual(next?.act, "talk", "what steering left");
  const facts = next?.act === "talk" ? next.facts ?? {} : {};
  assertEqual(facts.cannotDo, STEP_FACTS.variations.cantDo[0]!.what, "what Gala can't do");
  assert(STEP_FACTS.variations.canDo.includes(facts.closestMove as string), `the closest move is not one of the step's: ${facts.closestMove}`);
  assertEqual(facts.kitCanFinish, false, "kitCanFinish");
});

h.check("3b. the 12:23 resize at the lockup gets a can't-do reply with a move and the kit line", async () => {
  const { next } = await steered(projectAt("lockup"), "Make the droplet the same height as the letters.");
  assertEqual(next?.act, "talk", "what steering left");
  const facts = next?.act === "talk" ? next.facts ?? {} : {};
  assert(STEP_FACTS.lockup.cantDo.some((item) => item.what === facts.cannotDo && item.kitCanFinish), `what Gala can't do: ${facts.cannotDo}`);
  assert(STEP_FACTS.lockup.canDo.includes(facts.closestMove as string), `the closest move: ${facts.closestMove}`);
  assertEqual(facts.kitCanFinish, true, "kitCanFinish");
  assertEqual(facts.kitLine, KIT_LINE, "the kit line");
});

h.check("3c. the 12:27 two colors at the colorways gets a can't-do reply with a move and the kit line", async () => {
  const { next } = await steered(atColorways(), "Can the droplet have two colors, the top half in the primary and the bottom half in the secondary?");
  assertEqual(next?.act, "talk", "what steering left");
  const facts = next?.act === "talk" ? next.facts ?? {} : {};
  assertEqual(facts.cannotDo, "put two or more colors inside the symbol", "what Gala can't do");
  assert(STEP_FACTS.colorways.canDo.includes(facts.closestMove as string), `the closest move: ${facts.closestMove}`);
  assertEqual(facts.kitCanFinish, true, "kitCanFinish");
});

h.check("3d. a mark the person rejects never gets the kit line", async () => {
  const { next } = await steered(atColorways(), "I don't want this symbol at all, it's wrong. Can it at least be two colors?");
  assert(!(next?.act === "talk" && next.facts?.kitCanFinish === true), `the kit line went to a rejected mark: ${JSON.stringify(next)}`);
});

// 4. A change at the colorways goes to its step, the colors kept.

h.check("4a. a change to the symbol at the colorways goes back to the variations from the picked variation, with the colors kept", async () => {
  const store = atColorways();
  const { turn, next } = await steered(store, "Make the symbol's arch taller and narrower.");
  assertEqual(store.project.stage, "variations", "the stage");
  assertEqual(next?.act, "redo", "what steering left");
  assert(next?.act === "redo" && next.request.drawing !== null, "the change to the symbol was dropped");
  assertEqual(startingMark(turn, "variationSet", next?.act === "redo" ? next.request : null)?.id, "var-2", "the starting mark");
  assertEqual(store.latest("colorPicker").artifact!.saved, true, "the colors are still saved");
});

h.check("4b. when the color step opens again, saved colors stay saved and go straight on to the colorways", async () => {
  const store = atColorways();
  const turn = await open(store);
  assertEqual(await openColors(turn, []), "continue", "openColors' outcome");
  const picker = store.latest("colorPicker").artifact!;
  assertEqual(JSON.stringify(picker.colors), JSON.stringify(COLORS), "the colors");
  assertEqual(picker.saved, true, "saved");
});

await h.run();
