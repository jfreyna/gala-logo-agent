#!/usr/bin/env node
/**
 * Failures answered, as the page draws them.
 *
 *   node scripts/check-failures.mjs
 *
 * Runs in a headless browser against the dev preview (GALA_PREVIEW_URL,
 * default http://localhost:3000), on the sample screens the Feedback loops
 * frames draw, and two for errors under a card and in Memory.
 *
 * What this proves: each kind of notice draws its words and its way
 * forward (Couldn't with one button, Repeated with a step back and no
 * retry, Couldn't start with Try again); a failed send keeps the words and
 * the file, marks the bar Send failed, and puts the reason under it; a
 * refused card action and refused memory actions show the server's words
 * under the control they came from; on a phone the notice's button fills
 * the width.
 *
 * What it does not prove: the decisions behind them (engine/checks/
 * failures.check.ts), or the real deployment (scripts/check-feedback-walk.mjs).
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

async function open(path, width = 1440, height = 900) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  return page;
}

/** The notice on the page: its kind, title, words and buttons. */
const readNotice = (page) =>
  page.$eval('[data-name="gala-notice"]', (notice) => ({
    kind: notice.dataset.kind,
    text: notice.textContent,
    primary: [...notice.querySelectorAll('[data-name="button-primary"]')].map((button) => button.textContent),
    secondary: [...notice.querySelectorAll('[data-name="button-secondary"]')].map((button) => button.textContent),
    rule: getComputedStyle(notice.querySelector('[data-name="notice"]')).borderLeftColor,
  }));

check("Couldn't draw: a Couldn't notice with the cause, a warning rule and Choose another typeface", async () => {
  const page = await open("/preview/couldntDraw?top=1");
  const notice = await readNotice(page);
  expect(notice.kind === "Couldn't" && notice.text.includes("Couldn’t draw the wordmark") && notice.text.includes("Alata"), `the notice: ${JSON.stringify(notice)}`);
  expect(JSON.stringify(notice.primary) === '["Choose another typeface"]' && notice.secondary.length === 0, `the buttons: ${JSON.stringify(notice)}`);
  expect(notice.rule === "rgb(240, 192, 0)", `the rule: ${notice.rule}`);
  await page.close();
});

check("Same problem twice: Repeated offers Go back to Type and Tell me what to try, and no Try again", async () => {
  const page = await open("/preview/repeated?top=1");
  const notice = await readNotice(page);
  expect(notice.kind === "Repeated" && JSON.stringify(notice.primary) === '["Go back to Type"]' && JSON.stringify(notice.secondary) === '["Tell me what to try"]', `the notice: ${JSON.stringify(notice)}`);
  expect(!notice.text.includes("Try again"), "Repeated offered Try again");
  await page.close();
});

check("Couldn't start: says the choice is saved, with Try again", async () => {
  const page = await open("/preview/couldntStart?top=1");
  const notice = await readNotice(page);
  expect(notice.kind === "Couldn't start" && notice.text.includes("Your choice is saved") && JSON.stringify(notice.primary) === '["Try again"]', `the notice: ${JSON.stringify(notice)}`);
  await page.close();
});

check("Send failed: the words and the file stay, the bar says so, and the reason is under it", async () => {
  const words = "Here’s our storefront, and the street it’s on";
  const reason = "That file is too large. The limit is 10 MB. Your words are still here; attach a smaller file or send without it.";
  const page = await open(`/preview/sendFailed?top=1&attached=1&file=storefront.jpg&typing=${encodeURIComponent(words)}&sendError=${encodeURIComponent(reason)}`);
  const bar = await page.$eval('[data-name="gala-prompt-bar"]', (form) => ({
    state: form.dataset.state,
    border: getComputedStyle(form).borderTopColor,
    value: [...form.querySelectorAll("textarea")].map((field) => field.value)[0],
    file: form.textContent.includes("storefront.jpg"),
  }));
  expect(bar.state === "Send failed" && bar.border === "rgb(227, 99, 22)" && bar.value === words && bar.file, `the bar: ${JSON.stringify(bar)}`);
  const under = await page.$eval('[data-name="composer"]', (composer) => {
    const children = [...composer.children];
    const error = composer.querySelector('[data-name="gala-inline-error"]');
    return { after: error !== null && children.indexOf(error) > children.indexOf(composer.querySelector('[data-name="gala-prompt-bar"]')), text: error?.textContent };
  });
  expect(under.after && under.text === reason, `under the bar: ${JSON.stringify(under)}`);
  await page.close();
});

check("a refused card action: the server's words right under the card", async () => {
  const page = await open("/preview/cardError?top=1", 1440, 1040);
  const placed = await page.$eval('[data-name="with-error"]', (wrap) => ({ first: wrap.children[0]?.dataset.name, error: wrap.children[1]?.dataset.name, text: wrap.children[1]?.textContent }));
  expect(placed.first === "gala-wordmark" && placed.error === "gala-inline-error" && placed.text === "That step is done.", `the card and its error: ${JSON.stringify(placed)}`);
  await page.close();
});

check("refused memory actions: the server's words under the line and under Add", async () => {
  const page = await open("/preview/directions?panel=memoryErrors&top=1");
  const placed = await page.$$eval('[data-name="gala-inline-error"]', (errors) => errors.map((error) => [error.previousElementSibling?.dataset.name, error.textContent]));
  expect(
    JSON.stringify(placed) === JSON.stringify([["memory-row", "That line is too long."], ["add-memory", "Write something to remember."]]),
    `the errors and what they sit under: ${JSON.stringify(placed)}`,
  );
  await page.close();
});

check("a phone: the notice's button fills the width", async () => {
  const page = await open("/preview/couldntDraw?top=1", 380, 812);
  const fit = await page.$eval('[data-name="gala-notice"]', (notice) => {
    const button = notice.querySelector('[data-name="button-primary"]').getBoundingClientRect();
    const column = notice.querySelector('[data-name="actions"]').getBoundingClientRect();
    return { button: Math.round(button.width), column: Math.round(column.width) };
  });
  expect(fit.button === fit.column && fit.button > 300, `the button and its column: ${JSON.stringify(fit)}`);
  await page.close();
});

let passed = 0;
console.log(`Failures answered, as drawn (${BASE}): ${checks.length} checks`);
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
