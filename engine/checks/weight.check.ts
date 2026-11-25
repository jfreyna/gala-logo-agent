/**
 * The wordmark card names the weight it is drawn in (FRI-1713, from
 * FRI-1711 proposal 4).
 *
 *   node --env-file-if-exists=/home/sprite/gala.env --experimental-strip-types --no-warnings engine/checks/weight.check.ts
 *
 * It runs the wordmark step against the real Jev and model, so it runs
 * only on the Sprite. Storage is memory. Buda is the case from FRI-1711:
 * Google serves it in Light only, so the kit draws it at 300. Young Serif
 * has a Regular.
 *
 * What this proves: for each family, the card stores the weight the kit's
 * font loader reports drawing (`info.weight`), and the card's heading names
 * it ("Light", "Regular"). What it does not: any other family, or how the
 * browser draws the card (the page sets the same weight on the name).
 */
import { assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { loadFont } from "../../kit/src/font.ts";
import { weightName } from "../../src/studio/weights.ts";
import { runTurn } from "../loop.ts";
import { assertComplete, loadPrompt } from "../prompt.ts";
import { projectAt } from "./project.ts";

const prompt = await loadPrompt();
assertComplete(prompt);

const h = createHarness(`The wordmark card names the weight drawn (prompt: ${prompt.source})`);

for (const [family, weight, name] of [
  ["Buda", 300, "Light"],
  ["Young Serif", 400, "Regular"],
] as const) {
  h.check(`${family}: the card says ${name}, the weight the kit draws (${weight})`, async () => {
    const store = projectAt("wordmark", { withCard: false });
    const typeCard = store.latest("typeSet");
    typeCard.artifact = { ...typeCard.artifact!, directions: typeCard.artifact!.directions.map((entry: { id: string }) => (entry.id === typeCard.artifact!.chosenId ? { ...entry, family } : entry)) };
    assertEqual(await runTurn(store, prompt, new AbortController().signal), "done", "the turn's result");
    const drawn = (await loadFont(family, 400, globalThis.fetch as never)).info.weight;
    const card = store.latest("wordmark").artifact!;
    assertEqual([card.family, card.weight, drawn, weightName(card.weight)], [family, weight, weight, name], "family, stored weight, drawn weight, heading");
  });
}

await h.run();
