/**
 * No clip after the brief: the prompt bar shows the attach button
 * only while the project is at the brief, and a file that still arrives
 * after it gets an answer.
 *
 *   node --experimental-strip-types --no-warnings engine/checks/no-clip.check.ts
 *
 * Cases 1 and 2 need nothing but this repo. Case 3 opens the dev preview
 * (GALA_PREVIEW_URL, default http://localhost:3000) in a headless Chrome;
 * when the preview doesn't answer, case 3 is reported as not run and the run
 * says it is incomplete.
 *
 * What this proves:
 *   1. for every step, the studio's prompt bar rule (src/studio/promptFor.ts,
 *      the one the studio page uses) shows the attach button at the brief and
 *      at no other step; the drawing steps (symbol opener, directions,
 *      variations, stress test) ask "Describe it and I'll draw it.", and
 *      every other step after the brief keeps its own placeholder;
 *   2. at every step after the brief, a file sent with no words is steered to
 *      a reply that names the file (`talk` with `sentAFileWithNoWords`), so
 *      it is never met with silence;
 *   3. the built bar in the preview: the attach button is on the brief
 *      screens and on no screen after it; the drawing screens show the
 *      frame's line and the others do not.
 *
 * What it does not prove: a file sent with words after the brief (that
 * passes `cantDo` with `sentAFile` and is read by Jev; check:knows and
 * check:honest cover it, on the Sprite), the wording of Gala's reply, or a
 * file dropped or pasted into the page (the studio has no drop or paste
 * path; the attach button was the only way in). Case 3 reads the preview's
 * sample screens, not a real project; case 1 is the rule the real page uses.
 */
import { assert, assertEqual, createHarness, NotRun } from "../../kit/scripts/harness.ts";
import { AFTER_BRIEF, DRAWING_STEPS, promptFor } from "../../src/studio/promptFor.ts";
import { loadPrompt } from "../prompt.ts";
import { steer } from "../steer.ts";
import { STEPS } from "../steps.ts";
import type { Stage } from "../store.ts";
import { Turn } from "../turn.ts";
import { projectAt } from "./project.ts";

const prompt = await loadPrompt();
const h = createHarness(`No clip after the brief (prompt: ${prompt.source})`);
const AFTER = STEPS.filter((step) => step.stage !== "brief").map((step) => step.stage);

// 1. The rule the studio page uses.

h.check("1a. at the brief, the bar shows the attach button, before and after the brief card", () => {
  for (const hasBrief of [false, true]) {
    const bar = promptFor("brief", hasBrief);
    assert(bar.canAttach, `no attach button at the brief (hasBrief ${hasBrief})`);
    assert(bar.placeholder !== AFTER_BRIEF, "the brief asks for a description of the drawing");
  }
});

const DRAWING = AFTER.filter((stage) => DRAWING_STEPS.includes(stage));
const OTHER = AFTER.filter((stage) => !DRAWING_STEPS.includes(stage));

h.check(`1b. at the ${DRAWING.length} drawing steps, no attach button and "${AFTER_BRIEF}" on desktop and phone`, () => {
  assertEqual(DRAWING, ["symbolOpener", "directions", "variations", "stressTest"], "the drawing steps");
  for (const stage of DRAWING) assertEqual(promptFor(stage, true), { canAttach: false, placeholder: AFTER_BRIEF, placeholderMobile: AFTER_BRIEF }, stage);
});

h.check(`1c. at the ${OTHER.length} other steps after the brief, no attach button and the step's own placeholder`, () => {
  for (const stage of OTHER) {
    const bar = promptFor(stage, true);
    assert(!bar.canAttach, `${stage}: attach button`);
    assert(bar.placeholder !== AFTER_BRIEF && bar.placeholderMobile !== AFTER_BRIEF && bar.placeholder.length > 0, `${stage}: says "${bar.placeholder}"`);
  }
  assertEqual(promptFor("kit", true).placeholder, "Ask for a change, or start a new project.", "the kit");
});

// 2. A file that still arrives is answered.

const answerable = AFTER.filter((stage) => stage !== "done");
h.check(`2. a file with no words after the brief is steered to a reply naming it, at each of ${answerable.length} steps`, async () => {
  for (const stage of answerable) {
    const store = projectAt(stage as Stage);
    store.visitorSays("", { bytes: new Uint8Array([137, 80, 78, 71]), contentType: "image/png", fileName: "screenshot.png" });
    const turn = new Turn(store, prompt, new AbortController().signal);
    await turn.read();
    await steer(turn);
    const next = turn.take();
    assertEqual(next, { act: "talk", facts: { sentAFileWithNoWords: ["screenshot.png"] } }, `${stage}: steering`);
  }
});

// 3. The built bar.

const BASE = process.env.GALA_PREVIEW_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
/** Preview screens at the brief, and after it (src/dev/fixtures.ts). */
const AT_BRIEF = ["studio", "brief", "upload"];
const PAST_BRIEF = ["research", "type", "wordmark", "opener", "directions", "variations", "stress", "lockup", "pickColors", "color", "kit"];
/** Of those, the screens at a drawing step, which show the frame's line. */
const DRAWING_SCREENS = ["opener", "directions", "variations", "stress"];

h.check(`3. the preview: the attach button on ${AT_BRIEF.length} brief screens and on none of ${PAST_BRIEF.length} after it`, async () => {
  try {
    const response = await fetch(`${BASE}/preview/brief`);
    if (!response.ok) throw new Error(String(response.status));
  } catch (error) {
    throw new NotRun(`the preview at ${BASE} did not answer (${error instanceof Error ? error.message : error})`);
  }
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    for (const [width, size] of [[1440, "desktop"], [380, "phone"]] as const) {
      for (const name of [...AT_BRIEF, ...PAST_BRIEF]) {
        const page = await browser.newPage();
        await page.setViewport({ width, height: 900 });
        await page.goto(`${BASE}/preview/${name}`, { waitUntil: "networkidle0" });
        await page.waitForSelector('[data-name="gala-prompt-bar"]');
        const clips = await page.$$eval('[data-name="gala-prompt-bar"] [data-name="attach"]', (nodes) => nodes.length);
        const placeholder = await page.$$eval('[data-name="gala-prompt-bar"] textarea', (nodes) => nodes.find((node) => (node as HTMLElement).offsetParent !== null)?.getAttribute("placeholder") ?? null);
        await page.close();
        const atBrief = AT_BRIEF.includes(name);
        assertEqual(clips, atBrief ? 1 : 0, `${name} (${size}): attach buttons`);
        if (DRAWING_SCREENS.includes(name)) assertEqual(placeholder, AFTER_BRIEF, `${name} (${size}): placeholder`);
        else assert(placeholder !== null && placeholder !== AFTER_BRIEF, `${name} (${size}): says "${placeholder}"`);
      }
    }
  } finally {
    await browser.close();
  }
});

await h.run();
