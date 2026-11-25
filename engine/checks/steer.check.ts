/**
 * Steering, replayed on the founder's Gala-on-Gala conversation (FRI-1709
 * findings 5 to 7), line by line, against the real Jev and model.
 *
 *   node --env-file-if-exists=/home/sprite/gala.env engine/checks/steer.check.ts
 *
 * It calls the models, so it runs only on the Sprite. Storage is memory.
 * Each line's three scores print as Gala's log line does ("Steering at
 * directions: pick 0.91, back 0.04, change 0.38"), and never the message.
 *
 * What this proves: on these lines, the reading moves the work the way the
 * founder asked, and ordinary feedback moves nothing. What it does not:
 * other wordings. Each answer is one model's reading, so a pass is
 * evidence, not a guarantee.
 */
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { assertComplete, loadPrompt } from "../prompt.ts";
import { type } from "../stages/type.ts";
import { steer } from "../steer.ts";
import { MemoryStore } from "../store-memory.ts";
import { Turn, type Steering } from "../turn.ts";

const prompt = await loadPrompt();
assertComplete(prompt);

/** The project as it stood when the directions were offered on the founder's walk. */
function atDirections(): MemoryStore {
  const store = new MemoryStore();
  store.project = { id: "project", brandName: "Gala", stage: "directions" };
  const gala = (kind: string, artifact: Record<string, unknown>) =>
    store.messages.push({ id: `card-${store.messages.length}`, author: "gala", kind, text: null, artifact, upload: null });
  store.visitorSays("We need to design a logo for this product, Gala, a logo design partner for professional designers, marketers, and business owners. Modern and playful.");
  gala("brief", {
    say: "The brief is complete.",
    brand: "Gala",
    tagline: "Your logo design partner",
    whatYouDo: "Logo design partner that researches, drafts, and designs logos, and provides a professional finished kit",
    audience: "Professional designers, marketers, and business owners",
    whereUsed: ["App top left corner", "Website marketing", "Social media imagery"],
    never: ["cheesy", "superficial", "fake"],
    pending: [],
  });
  gala("research", {
    say: "I looked at three competitors and three neighbors.",
    competitors: [
      { name: "Canva", note: "A friendly script wordmark in a gradient circle.", imageUrl: null },
      { name: "Tailor Brands", note: "A plain sans wordmark with a small icon.", imageUrl: null },
      { name: "Adobe Express", note: "A red square app icon with a letter.", imageUrl: null },
    ],
    neighbors: [
      { name: "Figma", note: "Five colored shapes forming an F.", imageUrl: null },
      { name: "Notion", note: "A hand-drawn N in a cube.", imageUrl: null },
      { name: "Webflow", note: "A bold W in a blue square.", imageUrl: null },
    ],
  });
  gala("direction", { say: "Here is the direction.", mood: "Modern and playful", posture: "Tilted, in motion", energy: "Confident", references: [], approved: true });
  gala("typeSet", {
    say: "Three typefaces for the name.",
    brandName: "Gala",
    directions: [
      { id: "type-a", letter: "A", family: "Outfit", category: "Sans serif", moods: "Modern", rationale: "", pick: "gala" },
      { id: "type-b", letter: "B", family: "Fredoka", category: "Rounded", moods: "Playful", rationale: "", pick: null },
      { id: "type-c", letter: "C", family: "DM Serif Display", category: "Serif", moods: "Elegant", rationale: "", pick: null },
    ],
    chosenId: "type-a",
    saved: true,
    moodWeights: {},
  });
  gala("conceptSet", {
    say: "Three directions for the mark.",
    concepts: [
      { id: "mark-a", letter: "A", name: "Tilted Brush", rationale: "A brush stroke leaning forward.", markFileId: "file-a", sourceFileId: "file-a", checks: [] },
      { id: "mark-b", letter: "B", name: "Ink Pivot", rationale: "A drop of ink turning on its point.", markFileId: "file-b", sourceFileId: "file-b", checks: [] },
      { id: "mark-c", letter: "C", name: "Press Chase", rationale: "Two presses chasing each other.", markFileId: "file-c", sourceFileId: "file-c", checks: [] },
    ],
    discarded: [],
    chosenId: null,
  });
  return store;
}

/** The same project after B was chosen and three variations were offered. */
function atVariations(): MemoryStore {
  const store = atDirections();
  const concepts = store.latest("conceptSet");
  concepts.artifact = { ...concepts.artifact!, chosenId: "mark-b" };
  store.project.stage = "variations";
  store.messages.push({
    id: "card-variations",
    author: "gala",
    kind: "variationSet",
    text: null,
    artifact: {
      say: "Three variations of Ink Pivot.",
      concepts: [
        { id: "var-1", letter: "1", name: "Ink Pivot, steeper", rationale: "", markFileId: "file-1", sourceFileId: "file-1", checks: [] },
        { id: "var-2", letter: "2", name: "Ink Pivot, rounder", rationale: "", markFileId: "file-2", sourceFileId: "file-2", checks: [] },
        { id: "var-3", letter: "3", name: "Ink Pivot, heavier", rationale: "", markFileId: "file-3", sourceFileId: "file-3", checks: [] },
      ],
      setAside: [],
      chosenId: null,
    },
    upload: null,
  });
  return store;
}

const gala = (store: MemoryStore, text: string) => store.messages.push({ id: `say-${store.messages.length}`, author: "gala", kind: "text", text, artifact: null, upload: null });

/** Runs the reading on the newest line and returns what it left for the step. */
async function steered(store: MemoryStore): Promise<{ turn: Turn; left: Steering | null }> {
  const turn = new Turn(store, prompt, new AbortController().signal);
  await turn.read();
  await steer(turn);
  await turn.read();
  return { turn, left: turn.take() };
}

const chosenMark = (store: MemoryStore, kind: string) => store.latest(kind).artifact!.chosenId;

const h = createHarness(`Steering, the founder's walk replayed (prompt: ${prompt.source})`);

h.check(`"I like B as well… all capitals… the L replaced by the tilt" picks B and keeps the request`, async () => {
  const store = atDirections();
  store.visitorSays("I like B as well… I wonder what that typeface looks like with all capitals…, GALA, with the L being replaced by the tilt");
  const { left } = await steered(store);
  assertEqual(chosenMark(store, "conceptSet"), "mark-b", "the direction chosen");
  assertEqual(left, null, "what was left for the step after the pick");
  const requests = (store.latest("conceptSet").artifact!.requests ?? []) as string[];
  const nameAs = store.latest("typeSet").artifact!.nameAs;
  assert(requests.length > 0 || nameAs === "GALA", "neither the drawing request nor the name's case was kept");
  console.log(`  kept: name written ${nameAs ?? "(unchanged)"}; ${requests.length} drawing request(s)`);
});

h.check(`"I already said B" picks B`, async () => {
  const store = atDirections();
  store.visitorSays("I like B as well… I wonder what that typeface looks like with all capitals…, GALA, with the L being replaced by the tilt");
  gala(store, "All capitals would give Ink Pivot a sturdier stance. Pick A, B or C and I'll take it from there.");
  store.visitorSays("show me B with all capitals and that tilted form. and what if we don't tilt it, but cut out the shape of the tip of a brush inside it?");
  gala(store, "Cutting a brush tip into the mark is a lovely idea. Which direction should I take forward: A, B or C?");
  store.visitorSays("I already said B");
  await steered(store);
  assertEqual(chosenMark(store, "conceptSet"), "mark-b", "the direction chosen");
});

for (const [label, line] of [
  ['"go back to the wordmark… GALA in Alata"', "let's go back to the wordmark and start over with it in all caps. GALA in Alata"],
  ['"STOP… SHOW ME THE WORD GALA IN ALL CAPS… ALATA"', "I want you to STOP with the current direction and SHOW ME THE WORD GALA IN ALL CAPS set in the ALATA TYPE FACE"],
] as const) {
  h.check(`${label} lands on the type step with Alata first and the name as GALA`, async () => {
    const store = atVariations();
    store.visitorSays(line);
    const { turn, left } = await steered(store);
    assertEqual(store.project.stage, "type", "the step");
    assert(left !== null && left.act === "redo", `the type step was left ${left === null ? "nothing" : left.act}`);
    turn.steer(left);
    await type(turn);
    const set = store.latest("typeSet").artifact!;
    assertEqual(set.directions[0].family, "Alata", "the first specimen");
    assertEqual(set.directions[0].pick, "person", "the first specimen's mark");
    assertEqual(set.brandName, "GALA", "the name as set");
    assertEqual(set.chosenId, null, "a choice on the new type card");
    await turn.read();
    assertEqual(turn.current("conceptSet"), null, "the directions card, which is now history");
    assertEqual(turn.current("variationSet"), null, "the variations card, which is now history");
  });
}

h.check(`a plain "go back to the directions" shows the three again, nothing chosen, and keeps the later card as history`, async () => {
  const store = atVariations();
  store.visitorSays("none of these work for me, let's go back to the three directions");
  const { turn } = await steered(store);
  assertEqual(store.project.stage, "directions", "the step");
  const card = turn.current("conceptSet");
  assert(card !== null && card.id !== "card-4", "no new directions card");
  assertEqual(card.artifact!.chosenId, null, "a choice on the new directions card");
  assertEqual(card.artifact!.concepts.map((concept: { id: string }) => concept.id).join(","), "mark-a,mark-b,mark-c", "the options on it");
  assertEqual(turn.current("variationSet"), null, "the variations card, which is now history");
  assert(store.messages.some((message) => message.id === "card-variations"), "the variations card was deleted");
});

h.check(`"Back to this step" on the Type row takes the same move: the type card again, nothing chosen, and Gala's line`, async () => {
  const store = atVariations();
  const turn = new Turn(store, prompt, new AbortController().signal);
  await turn.read();
  await steer(turn, { back: "type" });
  await turn.read();
  assertEqual(store.project.stage, "type", "the step");
  const card = turn.current("typeSet");
  assert(card !== null && card.id !== "card-3", "no new type card");
  assertEqual(card.artifact!.chosenId, null, "a choice on the new type card");
  assert(typeof card.artifact!.say === "string" && card.artifact!.say !== "Three typefaces for the name.", "Gala said nothing new above the card");
  assertEqual(turn.current("conceptSet"), null, "the directions card, which is now history");
});

for (const [label, line] of [
  ["a question about a direction", "Why does Ink Pivot feel more energetic than Press Chase?"],
  ["ordinary feedback", "These are interesting. I didn't expect the ink drop."],
] as const) {
  h.check(`${label} stays on the step and moves nothing`, async () => {
    const store = atDirections();
    store.visitorSays(line);
    const { left } = await steered(store);
    assertEqual(store.project.stage, "directions", "the step");
    assertEqual(chosenMark(store, "conceptSet"), null, "the direction chosen");
    assert(left !== null && left.act !== "redo", `the step was told to ${left?.act ?? "do nothing"}`);
  });
}

h.check("an unclear message gets one question and moves nothing", async () => {
  const store = atDirections();
  store.visitorSays("B maybe? or back a step, not sure");
  const { left } = await steered(store);
  assertEqual(store.project.stage, "directions", "the step");
  assertEqual(chosenMark(store, "conceptSet"), null, "the direction chosen");
  assertEqual(left?.act, "ask", "what the step was told to do");
});

await h.run();
