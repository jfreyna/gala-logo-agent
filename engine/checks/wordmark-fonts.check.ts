/**
 * The wordmark step opens in typefaces that used to stop it.
 *
 *   node --env-file-if-exists=/home/sprite/gala.env engine/checks/wordmark-fonts.check.ts
 *
 * It runs the wordmark step against the real Jev and model, so it runs
 * only on the Sprite. Storage is memory. The families are test cases only:
 * Alata is the typeface the founder picked when the step failed on every
 * message, Roboto fails the same way on the old setter, and Pacifico is a
 * connected script.
 *
 * What this proves: with each of these chosen on the type card, the
 * wordmark step shows its card, set in that typeface and not signed off,
 * and Gala does not say the trouble line. What it does not: how the card
 * looks (the browser draws it), or any other typeface; the font sweep
 * (`npm run sweep:fonts`) measures the whole catalog through the setter.
 */
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { TROUBLE_LINE } from "../lines.ts";
import { runTurn } from "../loop.ts";
import { assertComplete, loadPrompt } from "../prompt.ts";
import { projectAt } from "./project.ts";

const prompt = await loadPrompt();
assertComplete(prompt);

const h = createHarness(`The wordmark step opens in any typeface (prompt: ${prompt.source})`);

for (const [family, why] of [
  ["Alata", "the typeface that stopped the step on the founder's walk"],
  ["Roboto", "the same cause, in the most used family"],
  ["Pacifico", "a connected script"],
] as const) {
  h.check(`${family} (${why}): the wordmark card shows, set in it, waiting for the sign-off`, async () => {
    const store = projectAt("wordmark", { withCard: false });
    const typeCard = store.latest("typeSet");
    typeCard.artifact = { ...typeCard.artifact!, directions: typeCard.artifact!.directions.map((entry: { id: string }) => (entry.id === typeCard.artifact!.chosenId ? { ...entry, family } : entry)) };
    const result = await runTurn(store, prompt, new AbortController().signal);
    assertEqual(result, "done", "the turn's result");
    assert(!store.messages.some((message) => message.text === TROUBLE_LINE), "Gala said the trouble line");
    const card = store.latest("wordmark").artifact!;
    assertEqual([card.family, card.brandName, card.approved], [family, "Ember & Rye", false], "the card");
    assertEqual(typeof card.readsAt16, "boolean", "the 16px reading");
    assertEqual(store.project.stage, "wordmark", "the stage");
  });
}

await h.run();
