/**
 * A held request reaches its step when that step opens.
 *
 *   node --env-file-if-exists=/home/sprite/gala.env engine/checks/held-reaches.check.ts
 *
 * It calls Jev, the model and Google Fonts, so it runs only on the Sprite.
 * Storage is memory.
 *
 * What this proves: for each step that takes requests, an idea stored for
 * it ahead of time is in what the step works from when it opens: the
 * typeface on the type card, the case on the wordmark card, the idea in
 * Gala's opening line for the symbol and in the list every drawing gets,
 * the layout on the lockup card, and the colors filled in on the color
 * card. What it does not: that the drawings themselves follow the idea
 * (this check never draws), or that Gala's wording about it is good.
 */
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { assertComplete, loadPrompt } from "../prompt.ts";
import { pickColors } from "../stages/color.ts";
import { standingRequests } from "../stages/directions.ts";
import { lockup } from "../stages/lockup.ts";
import { symbolOpener } from "../stages/opener.ts";
import { type } from "../stages/type.ts";
import { wordmark } from "../stages/wordmark.ts";
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

const h = createHarness(`Held requests reach their step (prompt: ${prompt.source})`);

h.check("a typeface asked for during the research is the first specimen when the type step opens, marked as the person's pick", async () => {
  const store = projectAt("type", { withCard: false });
  store.held.push({ step: "type", text: "Alata" });
  await type(await open(store));
  const set = store.latest("typeSet").artifact!;
  assertEqual(set.directions[0].family, "Alata", "the first specimen");
  assertEqual(set.directions[0].pick, "person", "the first specimen's mark");
  assertEqual(set.chosenId, null, "a choice on the card");
  assertEqual(store.project.stage, "type", "the stage");
});

h.check("all capitals asked for during the type step is the Case when the wordmark step opens", async () => {
  const store = projectAt("wordmark", { withCard: false });
  store.held.push({ step: "wordmark", text: "set the name in all capitals" });
  await wordmark(await open(store));
  const card = store.latest("wordmark").artifact!;
  assertEqual(card.case, "allCaps", "Case");
  assertEqual(card.brandName, "EMBER & RYE", "the name as set");
  assertEqual(card.approved, false, "approved");
  assertEqual(store.project.stage, "wordmark", "the stage");
});

h.check("a paintbrush asked for during the wordmark comes back in Gala's line at the symbol opener, and nothing is drawn", async () => {
  const store = projectAt("symbolOpener", { withCard: false });
  store.held.push({ step: "directions", text: "the symbol should be a paintbrush" });
  await symbolOpener(await open(store));
  const card = store.latest("symbolOpener").artifact!;
  assert(/paint\s?brush/i.test(card.say), "Gala's opening line does not name the paintbrush");
  assertEqual(card.answered, null, "answered");
  assertEqual(store.project.stage, "symbolOpener", "the stage");
  assert(!store.messages.some((message) => message.kind === "conceptSet"), "directions were drawn");
});

h.check("the same paintbrush is in what every drawing is given once the directions open", async () => {
  const store = projectAt("directions", { withCard: false });
  store.held.push({ step: "directions", text: "the symbol should be a paintbrush" });
  const requests = standingRequests(await open(store), null);
  assertEqual(requests.join(" | "), "the symbol should be a paintbrush", "what the drawings are given");
});

h.check("an idea said at the symbol opener stays on its card and is in what every drawing is given", async () => {
  const store = projectAt("symbolOpener");
  const turn = await open(store);
  turn.steer({ act: "redo", request: { typeface: null, nameAs: null, drawing: "a bread peel with a long handle", note: null } });
  await symbolOpener(turn);
  assertEqual(store.project.stage, "directions", "the stage");
  assertEqual(store.latest("symbolOpener").artifact!.answered, "idea", "answered");
  assertEqual(standingRequests(turn, null).join(" | "), "a bread peel with a long handle", "what the drawings are given");
});

h.check("the name under the symbol, asked for during the directions, is the Layout when the lockup opens", async () => {
  const store = projectAt("lockup", { withCard: false });
  store.held.push({ step: "lockup", text: "put the name underneath the symbol rather than beside it" });
  await lockup(await open(store));
  const card = store.latest("lockup").artifact!;
  assertEqual(card.layout, "stacked", "Layout");
  assertEqual(card.approved, false, "approved");
  assertEqual(store.project.stage, "lockup", "the stage");
});

h.check("colors described during the wordmark fill the color card in when it opens, still to be saved", async () => {
  const store = projectAt("lockup");
  store.held.push({ step: "pickColors", text: "a deep brick red with a warm cream" });
  store.latest("lockup").artifact!.approved = true;
  const turn = await open(store);
  assertEqual(await lockup(turn), "continue", "the lockup's outcome");
  await pickColors(turn);
  const picker = store.latest("colorPicker").artifact!;
  assert(picker.colors !== null && /^#[0-9A-F]{6}$/.test(picker.colors.primary), "the card has no primary color");
  assertEqual(picker.saved, false, "saved");
  assertEqual(store.project.stage, "pickColors", "the stage");
});

await h.run();
