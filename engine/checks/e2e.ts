/**
 * One full brief, end to end, on the Sprite: from the first message to a
 * chosen colorway, the kit and the picks, against the real models, with a
 * scripted person and storage held in memory.
 *
 *   node engine/checks/e2e.ts [folder to write the cards and marks to]
 *
 * It needs GALA_GEMINI_URL and GALA_TYPESAFE_URL, which answer only from
 * inside the Sprite.
 *
 * What this proves: the loop walks every stage in order, each step writes
 * the card the studio draws, choices come in threes, no hex value reaches
 * the chat, the kit function is called with what the person chose, and the
 * quote check runs before a quote would show.
 *
 * What it does not prove: anything about sign-in or the `frilly-gala`
 * routes (storage here is memory; those have their own checks), or that
 * the marks are good. Whether a mark is good is the person's call.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { fontData } from "../fonts.ts";
import { mentionsHex } from "../guard.ts";
import { runTurn } from "../loop.ts";
import { assertComplete, loadPrompt } from "../prompt.ts";
import { MemoryStore } from "../store-memory.ts";

const out = process.argv[2] ?? null;
const store = new MemoryStore();
const prompt = await loadPrompt();
assertComplete(prompt);
const started = Date.now();

async function turn(): Promise<void> {
  const before = Date.now();
  const result = await runTurn(store, prompt, new AbortController().signal);
  console.log(`        turn: ${result}, ${((Date.now() - before) / 1000).toFixed(1)} s, stage ${store.project.stage}`);
  assertEqual(result, "done", "the turn's result");
}

/** What the studio's buttons do, done here by hand. */
function press(kind: string, change: Record<string, unknown>): void {
  const card = store.latest(kind);
  card.artifact = { ...card.artifact, ...change };
}

const galaWords = () => store.messages.filter((message) => message.author === "gala").map((message) => message.text ?? JSON.stringify(message.artifact));

const h = createHarness(`Gala end to end (prompt: ${prompt.source})`);

h.check("brief: the first message produces a brief card with the brand's name", async () => {
  store.visitorSays("Ember & Rye, a wood-fired bakery in Madison. Never: fussy, corporate, cute.");
  await turn();
  const card = store.latest("brief").artifact!;
  assert(/ember/i.test(card.brand ?? ""), `brand is ${card.brand}`);
  assertEqual(card.never.length, 3, "never words");
  assertEqual(store.statuses[0], "Reading your brief", "the working line while the brief step runs");
});

h.check("brief to research: once the brief is complete, research and a direction follow in the same turn", async () => {
  for (let round = 0; round < 3 && store.project.stage === "brief"; round++) {
    store.visitorSays("It's for neighbors, early risers and the Saturday market crowd. The logo goes on the storefront sign, bags, menus and Instagram. No tagline. That's everything, go ahead.");
    await turn();
  }
  assertEqual(store.project.stage, "research", "stage");
  const research = store.latest("research").artifact!;
  assertEqual([research.competitors.length, research.neighbors.length], [3, 3], "competitors and neighbors shown");
  const direction = store.latest("direction").artifact!;
  assert(direction.mood && direction.posture && direction.energy && direction.references.length > 0, "the direction is incomplete");
});

h.check("type: approving the direction brings three typefaces, each a real Google family", async () => {
  press("direction", { approved: true });
  await turn();
  const set = store.latest("typeSet").artifact!;
  assertEqual(set.directions.length, 3, "typefaces");
  const families = new Set((await fontData()).families.map((family) => family.family));
  for (const direction of set.directions) assert(families.has(direction.family), `${direction.family} is not in Google's tag file`);
  assertEqual(new Set(set.directions.map((direction: { family: string }) => direction.family)).size, 3, "distinct families");
  console.log(`        ${set.directions.map((direction: { letter: string; family: string; category: string }) => `${direction.letter} ${direction.family} (${direction.category})`).join("; ")}`);
});

h.check("directions: choosing a typeface brings three drawn marks, each traced to vector paths and checked", async () => {
  const set = store.latest("typeSet").artifact!;
  press("typeSet", { chosenId: set.directions[0].id, saved: true });
  await turn();
  const concepts = store.latest("conceptSet").artifact!;
  assertEqual(concepts.concepts.length, 3, "directions");
  for (const concept of concepts.concepts) {
    const svg = new TextDecoder().decode((await store.readFile(concept.markFileId)).bytes);
    assert(svg.startsWith("<svg") && svg.includes("<path"), `${concept.name} has no vector mark`);
    assertEqual(concept.checks.map((check: { label: string }) => check.label), ["16px", "Circle", "Inverted"], "badges");
  }
  console.log(`        ${concepts.concepts.map((concept: { letter: string; name: string }) => `${concept.letter} ${concept.name}`).join("; ")}; set aside: ${concepts.discarded.length}`);
});

h.check("variations: picking a direction brings three variations of it", async () => {
  const concepts = store.latest("conceptSet").artifact!;
  press("conceptSet", { chosenId: concepts.concepts[0].id });
  await turn();
  assertEqual(store.latest("variationSet").artifact!.concepts.length, 3, "variations");
  assertEqual(store.project.stage, "variations", "stage");
});

h.check("stress test: picking a variation runs the four tests on it", async () => {
  const variations = store.latest("variationSet").artifact!;
  press("variationSet", { chosenId: variations.concepts[0].id });
  await turn();
  const checks = store.latest("stressTest").artifact!.checks;
  assertEqual(Object.keys(checks).sort(), ["circle", "inverted", "poster", "sixteen"], "tests");
  console.log(`        ${JSON.stringify(checks)}`);
});

h.check("color: approving the mark in words brings the pick-your-colors card", async () => {
  store.visitorSays("Approved. Let's move on to color.");
  await turn();
  assertEqual(store.project.stage, "pickColors", "stage");
  assertEqual(store.latest("colorPicker").artifact!.saved, false, "the picker starts unsaved");
});

h.check("colorways: saving colors brings three different colorways, each with the mark recolored in code", async () => {
  press("colorPicker", { colors: { primary: "#B83A1B", secondary: "#E3B65C", tertiary: "#2B2622" }, saved: true });
  await turn();
  const set = store.latest("colorwaySet").artifact!;
  assertEqual(set.colorways.length, 3, "colorways");
  assertEqual(new Set(set.colorways.map((entry: { assignment: unknown }) => JSON.stringify(entry.assignment))).size, 3, "distinct colorways");
  for (const colorway of set.colorways) {
    const svg = new TextDecoder().decode((await store.readFile(colorway.markFileId)).bytes);
    const fill = { primary: "#B83A1B", secondary: "#E3B65C", tertiary: "#2B2622" }[colorway.assignment.mark as "primary"];
    assert(svg.includes(`fill="${fill}"`), `colorway ${colorway.letter}'s mark is not in its ${colorway.assignment.mark} color`);
  }
});

h.check("kit: choosing a colorway hands the choices to buildKit and stores 38 files and six downloads", async () => {
  const set = store.latest("colorwaySet").artifact!;
  press("colorwaySet", { chosenId: set.colorways[0].id });
  await turn();
  assert(store.kit !== null, "no kit was stored");
  assertEqual(store.kit.files.length, 38, "kit files");
  assertEqual(store.kit.downloads.map((file) => file.label), ["SVG", "EPS", "PNG", "Square", "Social", "Kit"], "downloads");
  assertEqual(store.latest("kit").artifact!.lockups.length, 6, "lock-up previews");
  assertEqual(store.project.stage, "picks", "stage");
});

h.check("picks: the picks card lists every draft Gala showed", async () => {
  const picks = store.latest("picks").artifact!;
  const shown = store.messages
    .filter((message) => message.kind === "conceptSet" || message.kind === "variationSet")
    .reduce((count, message) => count + message.artifact!.concepts.length + (message.artifact!.discarded ?? message.artifact!.setAside ?? []).length, 0);
  assertEqual(picks.drafts.length, shown, "drafts on the picks card");
  assert(shown >= 6, `only ${shown} drafts`);
});

h.check("halls: a kind quote passes its check and an offensive one with a phone number is dropped", async () => {
  press("picks", { answered: "submitted" });
  store.quotes.push({ id: "fame", hall: "fame", quote: "The flame doubles as the scoring on the loaf. That sold me.", check: "none" });
  store.quotes.push({ id: "shame", hall: "shame", quote: "This one is garbage made by an idiot, call me at 414-555-0199.", check: "none" });
  await turn();
  assertEqual(store.quotes.map((quote) => `${quote.id}: ${quote.check}`), ["fame: passed", "shame: failed"], "quote checks");
  assertEqual(store.project.stage, "done", "stage");
});

h.check("the chat never shows a hex value: colors are named by role", () => {
  const offenders = store.messages.filter((message) => message.author === "gala").flatMap((message) => {
    const artifact = message.artifact ?? {};
    const words = [message.text ?? "", artifact.say ?? "", ...(artifact.colorways ?? []).flatMap((entry: { name: string; rationale: string }) => [entry.name, entry.rationale])];
    return words.filter(mentionsHex);
  });
  assertEqual(offenders, [], "lines with a hex value");
});

h.check("memory: the project's outcome is remembered, and every line sits under one of the Memory view's headings", () => {
  const outcome = store.memory.find((line) => line.group === "From past projects");
  assert(outcome !== undefined && outcome.text.startsWith(`${store.project.brandName}: picked the `), "the project's outcome was not remembered");
  for (const line of store.memory) assert(["About you", "Your taste", "From past projects"].includes(line.group), `unknown heading ${line.group}`);
});

await h.run();
console.log(`${((Date.now() - started) / 1000).toFixed(0)} s in all; ${galaWords().length} things written by Gala`);

if (out !== null) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "conversation.json"), JSON.stringify({ project: store.project, messages: store.messages, memory: store.memory, kit: store.kit && { files: store.kit.files.length, downloads: store.kit.downloads } }, null, 1));
  for (const [id, file] of store.files) {
    const extension = { "image/svg+xml": "svg", "image/jpeg": "jpg", "image/png": "png", "application/zip": "zip", "application/postscript": "eps" }[file.contentType] ?? "bin";
    writeFileSync(join(out, `${id}.${extension}`), file.bytes);
  }
}
