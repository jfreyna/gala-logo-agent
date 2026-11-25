/**
 * The founder's first walk, replayed: a brief for Gala's own logo.
 *
 *   node engine/checks/walk.check.ts
 *
 * On that walk, the person's third and fourth answers were each met with
 * the decline line, because the leak check judged Gala's line together
 * with the brief card's fields, which were the person's own words about an
 * AI design agent. This replays those exact messages through the brief
 * step, against the real models, and expects a brief card each time.
 *
 * It calls the models, so it runs only on the Sprite. Storage is memory.
 *
 * What this proves: on this conversation, three times over, the brief step
 * shows its card and does not decline. What it does not: other
 * conversations about AI products, or later steps of the same project. The
 * model's wording varies from run to run, so a pass is evidence, not a
 * guarantee; the card's fields score about 0.3 against a gate of 0.5.
 */
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { DECLINE_LINE } from "../lines.ts";
import { assertComplete, loadPrompt } from "../prompt.ts";
import { brief } from "../stages/brief.ts";
import { MemoryStore } from "../store-memory.ts";
import { Turn } from "../turn.ts";

const prompt = await loadPrompt();
assertComplete(prompt);

/** The conversation as it stood when the third answer arrived. */
function walk(): MemoryStore {
  const store = new MemoryStore();
  store.project.brandName = "Gala";
  const card = (say: string, extra: Record<string, unknown>) =>
    store.messages.push({
      id: `card-${store.messages.length}`,
      author: "gala",
      kind: "brief",
      text: null,
      artifact: { say, brand: "Gala", tagline: null, whatYouDo: "Logo design partner that researches, drafts, and designs logos, and provides a professional finished kit", audience: "Professional designers, marketers, and business owners", never: [], ...extra },
      upload: null,
    });
  store.visitorSays('We need to design a logo for this product, Gala. As you know, you are a logo design partner for professional designers, marketers, and business owners alike. You research, drafts, and designs a logo, and provide a professional finished kit in the end. Your logo should be a combination of modern and playful. One idea I have is for the "l" in your name to be a stylized paint brush, slightly tilted about 4 degrees to the right. the G, a, and second a should be in a font that aligns with the rest of the Frilly brand, but is still distinctive.');
  card("I have the brief started for Gala, including the tilted paintbrush idea for the letter l. Where will this logo live most often, such as an app icon, website header, or merchandise? Also, give me three anti-words, the things Gala must never feel like.", { whereUsed: null, pending: ["whereUsed", "tagline"] });
  store.visitorSays("the logo will live on the app (top left corner), and also on marketing materials on our website, in video posts, and social media imagery, including a 1200x630 og-image.");
  card("I have those placements recorded, so the mark needs to stay crisp in a small app corner and scale up for social graphics. Give me three anti-words, the things Gala must never feel like. Also, does Gala have a tagline, or should I leave that blank?", { whereUsed: ["App top left corner", "Website marketing materials", "Video posts", "Social media imagery (including 1200x630 og-image)"], pending: ["tagline"] });
  store.visitorSays('we can use "Your logo design partner" as the tagline. and as for the anti-words, Gala is never: cheesy, superficial, or fake.');
  return store;
}

const h = createHarness(`The founder's walk, replayed (prompt: ${prompt.source})`);

for (let run = 1; run <= 3; run++) {
  h.check(`run ${run}: the answer with the tagline and the anti-words gets a brief card, not the decline`, async () => {
    const store = walk();
    const turn = new Turn(store, prompt, new AbortController().signal);
    await turn.read();
    await brief(turn);
    const last = store.messages[store.messages.length - 1]!;
    assert(last.text !== DECLINE_LINE, "Gala declined");
    assertEqual(last.kind, "brief", "the last thing Gala wrote");
    assertEqual(last.artifact!.never.length, 3, "anti-words on the card");
    assert(/partner/i.test(last.artifact!.tagline ?? ""), `tagline is ${last.artifact!.tagline}`);
  });
}

await h.run();
