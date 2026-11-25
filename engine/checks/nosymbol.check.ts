/**
 * A wordmark-only logo happens only on an explicit ask.
 *
 *   node --env-file-if-exists=/home/sprite/gala.env engine/checks/nosymbol.check.ts
 *
 * It calls Jev and the model, so it runs only on the Sprite. Storage is
 * memory. Each line's scores print as Gala's log line does, never the
 * message.
 *
 * What this proves: at the symbol opener, on these lines, only a clear and
 * explicit ask for no symbol is read as one; a hedged or doubtful line
 * gets a question or a reply and is never taken as a yes; and an idea or
 * "go ahead" takes the symbol path. The last check then walks the name-only
 * path on real turns: color opens, the colorways carry no mark, the kit
 * holds the wordmark alone, and nothing Gala wrote names a mark. What it
 * does not: other wordings, or how the name-only cards look. Each answer is
 * one model's reading.
 */
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { runTurn } from "../loop.ts";
import { assertComplete, loadPrompt } from "../prompt.ts";
import { steer } from "../steer.ts";
import { Turn, type Steering } from "../turn.ts";
import { projectAt } from "./project.ts";

const prompt = await loadPrompt();
assertComplete(prompt);

async function said(line: string): Promise<{ left: Steering | null; answered: unknown; stage: string }> {
  const store = projectAt("symbolOpener");
  store.visitorSays(line);
  const turn = new Turn(store, prompt, new AbortController().signal);
  await turn.read();
  await steer(turn);
  return { left: turn.take(), answered: store.latest("symbolOpener").artifact!.answered, stage: store.project.stage };
}

const EXPLICIT = ["I don't want a symbol at all. Just the name.", "No icon please, the wordmark on its own is the whole logo.", "Skip the symbol entirely, a name-only logo is what I'm after."];
const NOT_AN_ASK = ["I'm not sure what the symbol should be.", "Do we even need a symbol?", "Keep the symbol simple.", "Nothing too busy, please.", "I can't picture anything yet."];

const h = createHarness(`Wordmark only, on an explicit ask (prompt: ${prompt.source})`);

for (const line of EXPLICIT) {
  h.check(`"${line}" is read as an explicit ask for no symbol`, async () => {
    const result = await said(line);
    assertEqual(result.left?.act, "noSymbol", "what the step was told");
    assertEqual(result.stage, "symbolOpener", "the stage");
  });
}

for (const line of NOT_AN_ASK) {
  h.check(`"${line}" is not taken as an ask for no symbol, and nothing moves`, async () => {
    const result = await said(line);
    assert(result.left?.act !== "noSymbol", "read as an explicit ask for no symbol");
    assertEqual(result.answered, null, "answered");
    assertEqual(result.stage, "symbolOpener", "the stage");
  });
}

h.check(`"Go ahead" takes the symbol path`, async () => {
  const result = await said("Go ahead, surprise me.");
  assertEqual(result.answered, "goAhead", "answered");
  assertEqual(result.left, null, "what was left for the step");
});

h.check("an idea takes the symbol path, with the idea", async () => {
  const result = await said("A bread peel with a long handle.");
  assert(result.left?.act === "redo" && result.left.request.drawing !== null, `the step was told ${result.left?.act ?? "nothing"}`);
});

h.check("after an explicit ask the project goes on with the name alone: color opens, the colorways carry no mark, and the kit is the wordmark only", async () => {
  const store = projectAt("symbolOpener");
  const turnOn = () => runTurn(store, prompt, new AbortController().signal);
  store.visitorSays(EXPLICIT[0]!);
  assertEqual(await turnOn(), "done", "the turn after the ask");
  assertEqual(store.project.stage, "pickColors", "the stage after the ask");
  assertEqual(store.latest("symbolOpener").artifact!.answered, "noSymbol", "answered");
  assert(!store.messages.some((message) => ["conceptSet", "variationSet", "stressTest", "lockup"].includes(message.kind) && message.id !== `card-${message.kind}`), "a symbol step ran");

  // The person saves their colors, as the card's button does.
  Object.assign(store.latest("colorPicker").artifact!, { colors: { primary: "#B83A1B", secondary: "#E3B65C", tertiary: "#2B2622" }, saved: true });
  assertEqual(await turnOn(), "done", "the turn after the colors");
  assertEqual(store.project.stage, "colorways", "the stage after the colors");
  const set = store.latest("colorwaySet").artifact!;
  assertEqual(set.colorways.length, 3, "colorways");
  assert(set.colorways.every((entry: Record<string, unknown>) => entry.markFileId === undefined), "a colorway carries a mark");

  // They choose the first colorway.
  set.chosenId = set.colorways[0].id;
  assertEqual(await turnOn(), "done", "the turn after the colorway");
  assertEqual(store.project.stage, "picks", "the stage after the kit");
  const card = store.latest("kit").artifact!;
  assertEqual(card.lockups.map((entry: { label: string }) => entry.label).join(", "), "Wordmark, All black, All white", "the kit card's previews");
  // Nine wordmark files (three variants in three formats), plus the square and the social image, which show the name.
  const kinds = [...new Set(store.kit!.files.map((file) => file.label.split(",")[0]))].sort().join(", ");
  assertEqual(kinds, "social, square, wordmark", "what the kit's files are");
  assertEqual(store.kit!.files.length, 11, "files in the kit");
  // Nothing Gala wrote on the way names a mark, a symbol or an icon as its own word.
  const written = [set.say, ...set.colorways.flatMap((entry: { name: string; rationale: string }) => [entry.name, entry.rationale]), card.say].join("\n");
  assert(!/\b(mark|symbol|icon)s?\b/i.test(written), "Gala's lines mention a mark, a symbol or an icon");
});

await h.run();
