/**
 * No typeface is offered, and no pick moves on, unless the name sets in it.
 *
 *   npm run check:typeset
 *
 * It calls Google Fonts and no model, so it runs anywhere. Storage is
 * memory. The families named below are test cases only: nothing in the
 * engine matches against them. Each was picked for what it lacks today
 * (Sunflower has no accented Latin, Noto Emoji no letters at all).
 *
 * What this proves: with the real setter, a candidate that cannot draw the
 * name is passed over for the next-ranked family in its class; three
 * typefaces are still found; a typeface the person named that cannot draw
 * the name is handed back with the reason; a pick that cannot be drawn
 * (as a type-tray pick can be) is un-picked and answered with a plain
 * line, and the step does not move; and a typeface that fails later, at
 * the wordmark, gets the same plain line instead of "Something went wrong".
 *
 * What it does not: the type step's own ranking (Jev's classes and mood
 * scores are stood in for by a made-up ranking here), the wording the
 * model writes above the card, or the browser's type tray itself. If
 * Google adds the missing letters to one of these families, its case fails
 * and needs another family.
 */
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { rank, type Family, type FontData } from "../fonts.ts";
import { cannotDrawLine, TROUBLE_LINE } from "../lines.ts";
import { runTurn } from "../loop.ts";
import { loadPrompt } from "../prompt.ts";
import { type } from "../stages/type.ts";
import type { MemoryStore } from "../store-memory.ts";
import { Turn } from "../turn.ts";
import { namesToSet, settablePicks, whyNot } from "../typeset.ts";
import { CannotSet } from "../../kit/src/font.ts";
import { projectAt } from "./project.ts";

const prompt = await loadPrompt();
const ACCENTED = "Café Noël";
const LACKS_ACCENTS = "Sunflower";
const LACKS_LETTERS = "Noto Emoji";

/** A made-up tag file: each class lists its families best fit first, by a falling mood score. */
function catalog(classes: Record<string, string[]>): FontData {
  const families: Family[] = Object.entries(classes).flatMap(([typeClass, names]) => names.map((family, index) => ({ family, classes: { [typeClass]: 100 }, moods: { Calm: 100 - index * 10 }, quality: 50 })));
  return { families, classes: Object.keys(classes), moods: ["Calm"] };
}
const WEIGHTS = { Calm: 1 };

async function open(store: MemoryStore): Promise<Turn> {
  const turn = new Turn(store, prompt, new AbortController().signal);
  await turn.read();
  return turn;
}
/** Gala's last words: a plain line, or a notice's (FRI-1714: a failure is answered in a notice). */
const lastLine = (store: MemoryStore) => {
  const last = store.messages.findLast((message) => message.author === "gala" && (message.kind === "text" || message.kind === "notice"));
  return last?.kind === "notice" ? (last.artifact?.say ?? "") : (last?.text ?? "");
};
/** The type card with one family picked, as a press on "Use this typeface" leaves it. */
function pick(store: MemoryStore, family: string): void {
  const card = store.latest("typeSet");
  card.artifact = { ...card.artifact!, directions: card.artifact!.directions.map((entry: { id: string }, index: number) => (index === 0 ? { ...entry, family, pick: "person" } : entry)), chosenId: card.artifact!.directions[0].id, saved: true };
}

const h = createHarness("The name sets in a typeface before it is offered or picked");

h.check("a candidate that can't draw the name is replaced by the next-ranked family in its class", async () => {
  const data = catalog({ Sans: [LACKS_ACCENTS, "Alata", "Roboto"] });
  const found = await settablePicks({ classes: data.classes, ranked: (typeClass) => rank(data, typeClass, WEIGHTS), names: namesToSet(ACCENTED), count: 1 });
  assertEqual(found.picks.map((entry) => entry.family.family), ["Alata"], "the pick");
  assertEqual(found.skipped, [LACKS_ACCENTS], "passed over");
});

h.check("still three: each class's failing first choice gives way, and a class with nothing that sets gives way to the next class", async () => {
  const data = catalog({ Sans: [LACKS_ACCENTS, "Alata"], Symbols: [LACKS_LETTERS], Script: ["Pacifico"], Serif: [LACKS_LETTERS, "Young Serif"] });
  const found = await settablePicks({ classes: data.classes, ranked: (typeClass) => rank(data, typeClass, WEIGHTS), names: namesToSet(ACCENTED), count: 3 });
  assertEqual(found.picks.map((entry) => `${entry.typeClass}: ${entry.family.family}`), ["Sans: Alata", "Script: Pacifico", "Serif: Young Serif"], "the picks");
  assert(found.picks.every((entry) => !entry.person), "a pick is marked as the person's");
});

h.check("the name is checked in every case the wordmark step can set it in", () => {
  assertEqual(namesToSet(ACCENTED), [ACCENTED, ACCENTED.toUpperCase(), ACCENTED.toLowerCase()], "names");
});

h.check("a typeface the person named that can't draw the name is handed back with the letters it lacks, and three others are found", async () => {
  const data = catalog({ Sans: [LACKS_ACCENTS, "Alata"], Script: ["Pacifico"], Serif: ["Young Serif"] });
  const named = data.families.find((family) => family.family === LACKS_ACCENTS)!;
  const found = await settablePicks({ classes: data.classes, ranked: (typeClass) => rank(data, typeClass, WEIGHTS), named: { typeClass: "Sans", family: named }, names: namesToSet(ACCENTED), count: 3 });
  assertEqual([found.refused?.family, found.refused?.why], [LACKS_ACCENTS, "missingLetters"], "handed back");
  assert(found.refused!.letters.includes("é"), "the reason does not name the missing letter");
  assertEqual(found.picks.map((entry) => entry.family.family), ["Alata", "Pacifico", "Young Serif"], "the picks");
});

h.check("a typeface that could not be reached is not confirmed: it is passed over as a candidate, and it is not called broken", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
  try {
    // A family no earlier check loaded, so nothing answers from memory.
    assertEqual(await whyNot("Bitter", ["Gala"]), "unconfirmed", "verdict");
  } finally {
    globalThis.fetch = real;
  }
  const data = catalog({ Sans: ["Work Sans", "Alata"] });
  const found = await settablePicks({ classes: data.classes, ranked: (typeClass) => rank(data, typeClass, WEIGHTS), names: ["Gala"], count: 1, check: async (family, names) => (family === "Work Sans" ? "unconfirmed" : whyNot(family, names)) });
  assertEqual(found.picks.map((entry) => entry.family.family), ["Alata"], "the pick");
});

h.check("a pick that can't be drawn (a type-tray pick) is un-picked, Gala says why in plain words, and the step does not move", async () => {
  const store = projectAt("type");
  pick(store, LACKS_LETTERS);
  await type(await open(store));
  const card = store.latest("typeSet").artifact!;
  assertEqual([card.chosenId, card.saved], [null, false], "the card's choice");
  assertEqual(store.project.stage, "type", "the stage");
  const line = lastLine(store);
  assertEqual(line, "I can’t draw “Ember & Rye” in Noto Emoji: that typeface has none of the letters in the name. Pick another typeface and I’ll set the name in it.", "Gala's line");
  assert(line !== TROUBLE_LINE, "Gala said the trouble line");
});

h.check("a pick that sets moves on to the wordmark: Alata, which stopped the wordmark step before", async () => {
  const store = projectAt("type");
  pick(store, "Alata");
  await type(await open(store));
  assertEqual(store.project.stage, "wordmark", "the stage");
  assertEqual(store.latest("typeSet").artifact!.saved, true, "the card stays picked");
});

h.check("a typeface that fails later, at the wordmark, gets the plain line and an offer to go back to type, not the trouble line", async () => {
  const store = projectAt("wordmark", { withCard: false });
  const card = store.latest("typeSet");
  card.artifact = { ...card.artifact!, directions: card.artifact!.directions.map((entry: { id: string }) => (entry.id === card.artifact!.chosenId ? { ...entry, family: LACKS_LETTERS } : entry)) };
  const result = await runTurn(store, prompt, new AbortController().signal);
  assertEqual(result, "done", "the turn's result");
  assertEqual(lastLine(store), "I can’t draw “Ember & Rye” in Noto Emoji: that typeface has none of the letters in the name. Want to go back to type and pick another?", "Gala's line");
  assertEqual(store.project.stage, "wordmark", "the stage");
});

h.check("the plain line names the letters a typeface lacks, in Gala's voice: first person, no dash", async () => {
  const verdict = await whyNot(LACKS_ACCENTS, [ACCENTED]);
  assert(verdict instanceof CannotSet, "Sunflower set the accented name");
  const line = cannotDrawLine(ACCENTED, verdict, true);
  assertEqual(line, "I can’t draw “Café Noël” in Sunflower: that typeface has no é or ë. Pick another typeface and I’ll set the name in it.", "the line");
  assert(!/[—–]/.test(line), "the line has a dash");
});

await h.run();
