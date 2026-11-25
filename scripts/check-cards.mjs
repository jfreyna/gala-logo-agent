#!/usr/bin/env node
/**
 * Cards and history (FRI-1713), as the page draws them: past cards are
 * read-only, and a card action's line shows on the person's side.
 *
 *   node scripts/check-cards.mjs
 *
 * Runs in a headless browser against the dev preview (GALA_PREVIEW_URL,
 * default http://localhost:3000), on the sample screens the Feedback loops
 * frames draw: History cards, Heard, Heard then working.
 *
 * What this proves: a past card has no live button or chip, only "Back to
 * this step"; the live card beside it keeps its chips and buttons; the
 * signed-off wordmark says the weight it is drawn in; the action's line
 * shows Sending (the thinking mark) and Sent (a check), on the right.
 *
 * What it does not prove: the live studio (a signed-in person and stored
 * cards; scripts/check-feedback-walk.mjs walks those on dev), or the look,
 * which the visual gate compares to the frames.
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.GALA_PREVIEW_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const checks = [];
const check = (name, run) => checks.push({ name, run });
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

async function open(path, width = 1440, height = 1040) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  return page;
}

/** The controls a person can press inside each card, by the card's data-name, in order. */
async function controls(page, name) {
  return page.$$eval(`[data-name="${name}"]`, (cards) =>
    cards.map((card) =>
      [...card.querySelectorAll("button, [role=button], input, textarea")]
        .filter((control) => !control.disabled && control.getAttribute("tabindex") !== "-1")
        .map((control) => (control.textContent ?? "").trim() || control.getAttribute("aria-label") || control.tagName),
    ),
  );
}

check("History cards: the signed-off direction has one control, Back to this step", async () => {
  const page = await open("/preview/history");
  const [direction] = await controls(page, "gala-direction");
  expect(JSON.stringify(direction) === JSON.stringify(["Back to this step"]), `the direction's controls: ${JSON.stringify(direction)}`);
  await page.close();
});

check("History cards: the signed-off type card has one control, Back to this step, and no Edit", async () => {
  const page = await open("/preview/history");
  const [type] = await controls(page, "gala-type-set");
  expect(JSON.stringify(type) === JSON.stringify(["Back to this step"]), `the type card's controls: ${JSON.stringify(type)}`);
  await page.close();
});

check("History cards: the live wordmark keeps its six chips and two buttons, and no footer", async () => {
  const page = await open("/preview/history");
  const [wordmark] = await controls(page, "gala-wordmark");
  expect(wordmark.length === 8 && wordmark.includes("Use this wordmark") && wordmark.includes("ALL CAPS"), `the wordmark's controls: ${JSON.stringify(wordmark)}`);
  expect((await page.$('[data-name="gala-wordmark"] [data-name="gala-card-footer"]')) === null, "the live wordmark has a footer");
  await page.close();
});

check("History cards: both footers say Signed off", async () => {
  const page = await open("/preview/history");
  const states = await page.$$eval('[data-name="gala-card-footer"]', (footers) => footers.map((footer) => [footer.dataset.state, footer.textContent]));
  expect(states.length === 2 && states.every(([state, text]) => state === "Signed off" && text.includes("Signed off")), `the footers: ${JSON.stringify(states)}`);
  await page.close();
});

check("Heard, then working: the signed-off wordmark has no chips or buttons, only Back to this step, and names its weight", async () => {
  const page = await open("/preview/heardWorking?top=1", 1440, 995);
  const [wordmark] = await controls(page, "gala-wordmark");
  expect(JSON.stringify(wordmark) === JSON.stringify(["Back to this step"]), `the wordmark's controls: ${JSON.stringify(wordmark)}`);
  const heading = await page.$eval('[data-name="gala-wordmark"] [data-name="heading"]', (element) => element.textContent);
  expect(heading.includes("Young Serif · Regular"), `the heading: ${heading}`);
  await page.close();
});

check("Heard: the action's line shows at once on the right, Sending, with the thinking mark", async () => {
  const page = await open("/preview/heard?top=1", 1440, 948);
  const echo = await page.$eval('[data-name="gala-action-echo"]', (element) => ({
    state: element.dataset.state,
    text: element.textContent,
    thinking: element.querySelector('[data-name="thinking"]') !== null,
    right: Math.round(element.getBoundingClientRect().right),
    rowRight: Math.round(element.parentElement.getBoundingClientRect().right),
  }));
  expect(echo.state === "Sending" && echo.text === "Using this wordmark" && echo.thinking, `the line: ${JSON.stringify(echo)}`);
  expect(echo.right === echo.rowRight, `the line is not on the right: ${JSON.stringify(echo)}`);
  await page.close();
});

check("Heard, then working: the line is Sent, with a check, above Gala's working line", async () => {
  const page = await open("/preview/heardWorking?top=1", 1440, 995);
  const order = await page.$$eval('[data-name="gala-action-echo"], [role="status"]', (elements) => elements.map((element) => element.dataset.state ?? element.textContent));
  const echo = await page.$eval('[data-name="gala-action-echo"]', (element) => ({ state: element.dataset.state, text: element.textContent, check: element.querySelector("svg") !== null }));
  expect(echo.state === "Sent" && echo.text === "Used this wordmark" && echo.check, `the line: ${JSON.stringify(echo)}`);
  expect(order[0] === "Sent" && order.some((entry) => /Opening the symbol step/.test(entry)), `the order: ${JSON.stringify(order)}`);
  await page.close();
});

check("a phone: the footer fills the card, and Back to this step still shows", async () => {
  const page = await open("/preview/history", 380, 812);
  const fit = await page.$$eval('[data-name="gala-card-footer"]', (footers) =>
    footers.map((footer) => {
      const card = footer.parentElement.getBoundingClientRect();
      const own = footer.getBoundingClientRect();
      return { fills: Math.round(card.width - own.width) === 32, back: footer.textContent.includes("Back to this step") };
    }),
  );
  expect(fit.length === 2 && fit.every((entry) => entry.fills && entry.back), `the footers on a phone: ${JSON.stringify(fit)}`);
  await page.close();
});

let passed = 0;
console.log(`Cards and history, as drawn (${BASE}): ${checks.length} checks`);
for (const { name, run } of checks) {
  try {
    await run();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
  }
}
await browser.close();
console.log(passed === checks.length ? `${passed}/${checks.length} passed` : `${passed}/${checks.length} passed (${checks.length - passed} failed)`);
process.exit(passed === checks.length ? 0 : 1);
