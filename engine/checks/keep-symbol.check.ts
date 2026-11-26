/**
 * Keep the approved symbol through a wordmark or typeface change
 * (from a test walk: a lowercase name asked for after the kit dropped the droplet).
 *
 *   node --experimental-strip-types --no-warnings engine/checks/keep-symbol.check.ts
 *
 * Storage is memory. Cases 1 to 4 call no model: the offer is made by
 * `nameChange`, the function steering calls once Jev has read a name or
 * typeface change, and the answers are the reply buttons' stored presses.
 * The new wordmark's approval is a card written approved, as "Use this
 * wordmark" leaves it, so nothing is set in type or drawn. Case 5 sends the
 * walk's words and needs Jev and the models (the Sprite); without
 * GALA_TYPESAFE_URL it is reported as not run, and the run as incomplete.
 *
 * What this proves:
 *   1. after the kit, a lowercase name with the droplet approved stores the
 *      keep-the-symbol offer (with the symbol's name) instead of going back;
 *   2. Keep it: the name change goes back to the wordmark as today, the
 *      symbol is marked kept, and once the new wordmark is approved the
 *      opener skips the symbol steps to the lockup; the lockup is drawn
 *      again (the old one is history), from the same droplet, and the saved
 *      colors stay saved; "kept" is used once;
 *   3. Draw new ones: the same go back, nothing kept, so the opener has
 *      nothing to skip;
 *   4. a typeface change makes the same offer and, kept, goes back through
 *      the type step;
 *   5. on the Sprite: the walk's words at the kit ("make the name all
 *      lowercase") reach the offer, and a typed "keep it" keeps the symbol.
 *
 * What it does not prove: the lockup and kit drawn again (the lockup's
 * drawing and the kit build are covered by check:e2e), or Gala's wording.
 */
import { assert, assertEqual, createHarness, NotRun } from "../../kit/scripts/harness.ts";
import { repliesFor } from "../../src/studio/replies.ts";
import { loadPrompt } from "../prompt.ts";
import { chosenConcept } from "../stages/directions.ts";
import { symbolOpener } from "../stages/opener.ts";
import { wordmark } from "../stages/wordmark.ts";
import { nameChange, pendingOffer, steer, type Offer } from "../steer.ts";
import type { MemoryStore } from "../store-memory.ts";
import type { Stage } from "../store.ts";
import { Turn } from "../turn.ts";
import { projectAt } from "./project.ts";

const prompt = await loadPrompt();
const h = createHarness(`Keep the approved symbol (prompt: ${prompt.source})`);

async function open(store: MemoryStore): Promise<Turn> {
  const turn = new Turn(store, prompt, new AbortController().signal);
  await turn.read();
  return turn;
}

const plain = (store: MemoryStore) => store.messages.map((message) => ({ id: message.id, author: message.author, kind: message.kind, artifact: message.artifact as Record<string, any> | null }));
const latestOf = (store: MemoryStore, kind: string) => store.messages.findLast((message) => message.kind === kind) ?? null;

/** The walk's project at the kit: the droplet approved, colors saved, the lockup and kit done. */
function atTheKit(): MemoryStore {
  const store = projectAt("lockup");
  const lockup = latestOf(store, "lockup")!;
  lockup.artifact = { ...lockup.artifact!, approved: true };
  store.messages.push({ id: "card-colorPicker", author: "gala", kind: "colorPicker", text: null, artifact: { say: "Pick your colors.", colors: { primary: "#4A2C82", secondary: "#8FB43A", tertiary: null }, saved: true }, upload: null });
  store.messages.push({ id: "card-kit", author: "gala", kind: "kit", text: null, artifact: { say: "Your kit is ready." }, upload: null });
  store.project = { ...store.project, stage: "kit" as Stage };
  return store;
}

const LOWERCASE = { typeface: null, nameAs: "ember & rye", drawing: null, note: null };
const stressCard = (store: MemoryStore) => latestOf(store, "stressTest")!;

/** Makes the offer as steering does, and writes Gala's line under it. */
async function offerAt(store: MemoryStore, to: "wordmark" | "type", request: typeof LOWERCASE): Promise<Offer> {
  const turn = await open(store);
  await nameChange(turn, to, request);
  const next = turn.take();
  assert(next?.act === "offer" && next.symbolName !== undefined, `steering left ${JSON.stringify(next)}`);
  store.messages.push({ id: "offer-line", author: "gala", kind: "text", text: "Lowercase it is. Keep your symbol?", artifact: null, upload: null });
  return stressCard(store).artifact!.offer as Offer;
}

/** A reply button press (the act case `answerOffer`) and the turn it wakes. */
async function press(store: MemoryStore, answer: "yes" | "no"): Promise<void> {
  const card = stressCard(store);
  card.artifact = { ...card.artifact!, offer: { ...(card.artifact!.offer as Offer), pressed: answer } };
  store.messages.push({ id: `echo-${store.messages.length}`, author: "visitor", kind: "action", text: null, artifact: { sending: "", sent: "", wakes: true }, upload: null });
  await steer(await open(store));
}

/** The new wordmark, approved with "Use this wordmark"; the wordmark step then opens the symbol. */
async function approveNewWordmark(store: MemoryStore): Promise<void> {
  store.messages.push({ id: `card-wordmark-${store.messages.length}`, author: "gala", kind: "wordmark", text: null, artifact: { say: "Here it is.", brandName: "ember & rye", family: "Young Serif", case: "lowercase", spacing: "asDrawn", letterSpacingEm: 0, readsAt16: true, approved: true }, upload: null });
  store.project = { ...store.project, stage: "wordmark" as Stage };
  assertEqual(await wordmark(await open(store)), "continue", "the wordmark step");
  assertEqual(store.project.stage, "symbolOpener", "after the wordmark");
}

h.check("1. after the kit, a lowercase name with the droplet approved stores the keep-the-symbol offer", async () => {
  const store = atTheKit();
  const approved = chosenConcept(await open(store), "variationSet").name;
  const offer = await offerAt(store, "wordmark", LOWERCASE);
  assertEqual(offer.keepSymbol, { name: approved, to: "wordmark" }, "the offer's symbol");
  assertEqual(offer.request, LOWERCASE, "the change it holds");
  assertEqual(store.project.stage, "kit", "the project's step, before the answer");
  const row = repliesFor(plain(store), {}, false)["offer-line"];
  assertEqual(row?.view.primary, "Keep it", "the first button");
  assertEqual(row?.view.secondary, "Draw new ones", "the second button");
});

h.check("2. Keep it: back to the wordmark, then the opener skips to the lockup with the same droplet, colors kept", async () => {
  const store = atTheKit();
  const approved = chosenConcept(await open(store), "variationSet").name;
  await offerAt(store, "wordmark", LOWERCASE);
  await press(store, "yes");
  assertEqual(store.project.stage, "wordmark", "the project's step after Keep it");
  assertEqual(stressCard(store).artifact!.keptSymbol, true, "the symbol kept");
  assertEqual(repliesFor(plain(store), {}, false)["offer-line"]?.view.state, "Done", "the row");
  await approveNewWordmark(store);
  const turn = await open(store);
  assertEqual(await symbolOpener(turn), "continue", "the opener");
  assertEqual(store.project.stage, "lockup", "the project's step after the opener");
  assertEqual(stressCard(store).artifact!.keptSymbol, "used", "kept, once");
  const after = await open(store);
  assert(after.current("lockup") === null, "the old lockup is still current, so it would not be drawn again");
  assertEqual(chosenConcept(after, "variationSet").name, approved, "the mark the lockup reads");
  assertEqual(latestOf(store, "colorPicker")!.artifact!.saved, true, "the colors");
  assert(!store.messages.slice(-3).some((message) => message.kind === "symbolOpener"), "an opener was written");
});

h.check("3. Draw new ones: the same go back, nothing kept, so the opener has nothing to skip", async () => {
  const store = atTheKit();
  await offerAt(store, "wordmark", LOWERCASE);
  await press(store, "no");
  assertEqual(store.project.stage, "wordmark", "the project's step");
  assert(stressCard(store).artifact!.keptSymbol === undefined, "the symbol was kept");
  assert(pendingOffer(await open(store)) === null, "the offer still stands");
});

h.check("4. a typeface change makes the same offer and, kept, goes back through the type step", async () => {
  const store = atTheKit();
  const offer = await offerAt(store, "type", { ...LOWERCASE, nameAs: null, typeface: "Fraunces" } as never);
  assertEqual(offer.keepSymbol?.to, "type", "where it goes back");
  await press(store, "yes");
  assertEqual(store.project.stage, "type", "the project's step");
  assertEqual(stressCard(store).artifact!.keptSymbol, true, "the symbol kept");
});

h.check("5. the walk's words at the kit reach the offer, and a typed keep it keeps the symbol", async () => {
  if ((process.env.GALA_TYPESAFE_URL ?? "") === "") throw new NotRun("needs Jev and the models (run it on the Sprite)");
  const store = atTheKit();
  store.visitorSays("Can we make the name all lowercase?");
  await steer(await open(store));
  const offer = stressCard(store).artifact!.offer as Offer | null;
  assertEqual(offer?.keepSymbol?.to, "wordmark", "the offer");
  store.messages.push({ id: "offer-line", author: "gala", kind: "text", text: "Lowercase it is. Keep your symbol?", artifact: null, upload: null });
  store.visitorSays("Keep it.");
  await steer(await open(store));
  assertEqual(stressCard(store).artifact!.keptSymbol, true, "the symbol kept");
  assertEqual(store.project.stage, "wordmark", "the project's step");
});

await h.run();
