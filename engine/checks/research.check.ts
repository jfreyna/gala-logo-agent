/**
 * The research cards' images, on a test brief for
 * Gala's own logo, against the real model and the real sites.
 *
 *   node --env-file-if-exists=/home/sprite/gala.env engine/checks/research.check.ts [folder for the icons]
 *
 * It calls the models, so it runs only on the Sprite. Storage is memory.
 * The address guard is checked first, with no model.
 *
 * What this proves: on this brief, the research step stores each brand's
 * own site icon, at most 256px, or leaves the default image; and the
 * "distinct" check is handed the competitors' icons as images. What it does
 * not: that a site icon is the brand's full logo. Many are app icons.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { assertComplete, loadPrompt } from "../prompt.ts";
import { candidatesIn, get, PrivateAddressError, publicOnlyLookup, safeUrl, storable } from "../siteIcon.ts";
import { competitorImages, research } from "../stages/research.ts";
import { MemoryStore } from "../store-memory.ts";
import { Turn } from "../turn.ts";

const out = process.argv[2] ?? null;
const prompt = await loadPrompt();
assertComplete(prompt);

const pngSize = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
};

const h = createHarness(`Research cards show the brands' own site icons (prompt: ${prompt.source})`);

h.check("the address guard refuses anything but a public https site", async () => {
  for (const address of ["http://www.canva.com", "https://127.0.0.1", "https://10.0.0.8/x", "https://[::1]/", "https://localhost", "https://metadata.google.internal", "https://www.canva.com:8443", "https://user:pw@www.canva.com", "file:///etc/passwd"]) {
    assertEqual(await safeUrl(address), null, address);
  }
  assert((await safeUrl("https://www.canva.com")) !== null, "a public site was refused");
});

h.check("at connect time, a name that resolves to a private address is refused (the DNS rebinding case)", async () => {
  // Public test names that answer with 127.0.0.1: what a rebinding name would answer at fetch time.
  const names = ["localtest.me", "127.0.0.1.nip.io"];
  const ask = (name: string) => new Promise<{ error: unknown; address: unknown }>((resolve) => publicOnlyLookup(name, {}, (error, address) => resolve({ error, address })));
  let tried = 0;
  for (const name of names) {
    const answer = await ask(name);
    if (answer.error !== null && !(answer.error instanceof PrivateAddressError)) continue; // the name didn't resolve here
    tried++;
    assert(answer.error instanceof PrivateAddressError, `${name} was not refused by the lookup (got ${String(answer.address)})`);
    // The fetch itself, past the up-front check, uses the same lookup and gets nothing.
    assertEqual(await get(new URL(`https://${name}/favicon.ico`)), null, `a fetch from ${name}`);
  }
  assert(tried > 0, "none of the test names resolved, so the refusal was not exercised");
  const publicName = await ask("www.canva.com");
  assert(publicName.error === null && typeof publicName.address === "string", "a public name was refused by the lookup");
});

h.check("a page's icons are read best first: touch icon, largest sized icon, then og:image", async () => {
  const html = `<head><link rel="icon" href="/16.png" sizes="16x16"><meta property="og:image" content="https://cdn.example.com/og.jpg"><link rel="icon" sizes="192x192" href="/192.png"><link rel="apple-touch-icon" href="/touch.png"></head>`;
  assertEqual(candidatesIn(html).join(" "), "/touch.png /192.png /16.png https://cdn.example.com/og.jpg", "the order");
});

h.check("an icon under about 128px is not kept, and an SVG that links outside itself is not drawn", async () => {
  const tiny = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 32, 0, 0, 0, 32]);
  assertEqual(storable("image/png", tiny), null, "a 32px icon");
  const linked = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><image href="/etc/hosts"/></svg>');
  assertEqual(storable("image/svg+xml", linked), null, "an SVG with an outside link");
});

h.check("the Gala brief: six cards, each with the brand's own icon or the default image, and the distinct check gets the competitors' icons", async () => {
  const store = new MemoryStore();
  store.project = { id: "project", brandName: "Gala", stage: "research" };
  store.visitorSays('We need to design a logo for this product, Gala. You are a logo design partner for professional designers, marketers, and business owners alike. You research, draft, and design a logo, and provide a professional finished kit. Modern and playful.');
  store.messages.push({
    id: "card-brief",
    author: "gala",
    kind: "brief",
    text: null,
    artifact: {
      say: "The brief is complete.",
      brand: "Gala",
      tagline: "Your logo design partner",
      whatYouDo: "Logo design partner that researches, drafts, and designs logos, and provides a professional finished kit",
      audience: "Professional designers, marketers, and business owners",
      whereUsed: ["App top left corner", "Website marketing materials", "Video posts", "Social media imagery"],
      never: ["cheesy", "superficial", "fake"],
      pending: [],
    },
    upload: null,
  });
  const turn = new Turn(store, prompt, new AbortController().signal);
  await turn.read();
  await research(turn);
  const card = store.latest("research").artifact!;
  const entries = [...card.competitors, ...card.neighbors] as { name: string; imageFileId?: string; imageUrl?: null }[];
  assertEqual(entries.length, 6, "cards");
  let found = 0;
  if (out !== null) await mkdir(out, { recursive: true });
  for (const entry of entries) {
    if (entry.imageFileId === undefined) {
      assertEqual(entry.imageUrl, null, `${entry.name}'s default image`);
      console.log(`  ${entry.name}: no usable site icon, default image`);
      continue;
    }
    const file = await store.readFile(entry.imageFileId);
    const [width, height] = pngSize(file.bytes);
    assert(width! <= 256 && width! > 0 && height! > 0, `${entry.name}'s icon is ${width}x${height}`);
    found++;
    console.log(`  ${entry.name}: site icon, ${width}x${height}`);
    if (out !== null) await writeFile(join(out, `${entry.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`), file.bytes);
  }
  if (out !== null) await writeFile(join(out, "research.json"), JSON.stringify(card, null, 2));
  const images = await competitorImages(turn);
  const competitorsWithIcons = (card.competitors as { imageFileId?: string }[]).filter((entry) => entry.imageFileId !== undefined).length;
  assertEqual(images.length, competitorsWithIcons, "competitor images handed to the distinct check");
  console.log(`  ${found} of 6 site icons found; the distinct check gets ${images.length} competitor image(s)`);
  assert(found >= 3, `only ${found} of 6 site icons found`);
});

await h.run();
