#!/usr/bin/env node
/**
 * Small feedback, as the page draws it.
 *
 *   node scripts/check-feedback-drawn.mjs
 *
 * Runs in a headless browser against the dev preview (GALA_PREVIEW_URL,
 * default http://localhost:3000), on the screens the Feedback loops frames
 * draw: Handed off, Stopped, Downloads and Back while working.
 *
 * What this proves: the bar in Handed off has the 2px button-1 border and a
 * placeholder that types itself in, in text-blue-1; the Stopped line is
 * words only; "Back to this step" is unavailable while Gala works, on the
 * Work panel's done rows and on past cards, and says why; the kit's
 * downloads show Saving, Saved and Couldn't; and `download` reports a file
 * that can't be fetched instead of throwing.
 *
 * What it does not prove: which actions hand off, or the Stopped line's
 * words (engine/checks/feedback.check.ts), or the button states
 * (scripts/check-states.mjs).
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

check("Handed off: a 2px button-1 border, and the placeholder types itself in, in text-blue-1", async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  // Read the placeholder as soon as the bar is on the page, before it has finished typing itself in.
  await page.goto(`${BASE}/preview/handedOff?top=1&handedOff=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-name="gala-prompt-bar"] textarea');
  const first = await page.$eval('[data-name="gala-prompt-bar"] textarea', (field) => field.placeholder.length);
  await new Promise((resolve) => setTimeout(resolve, 1600));
  const bar = await page.$eval('[data-name="gala-prompt-bar"]', (form) => {
    const field = [...form.querySelectorAll("textarea")].find((entry) => entry.offsetParent !== null);
    return { state: form.dataset.state, width: getComputedStyle(form).borderTopWidth, color: getComputedStyle(form).borderTopColor, placeholder: field.placeholder, placeholderColor: getComputedStyle(field, "::placeholder").color };
  });
  expect(bar.state === "Handed off" && bar.width === "2px" && bar.color === "rgb(99, 59, 164)", `the bar: ${JSON.stringify(bar)}`);
  expect(first < bar.placeholder.length && bar.placeholder === "Tell me what you’d like to change…", `the placeholder typed from ${first} letters to: ${bar.placeholder}`);
  expect(bar.placeholderColor === "rgb(59, 113, 135)", `the placeholder color: ${bar.placeholderColor}`);
  await page.close();
});

check("Handed off with motion reduced: the placeholder is there at once", async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.goto(`${BASE}/preview/handedOff?top=1&handedOff=1`, { waitUntil: "networkidle0" });
  const placeholder = await page.$eval('[data-name="gala-prompt-bar"] textarea', (field) => field.placeholder);
  expect(placeholder === "Tell me what you’d like to change…", `the placeholder: ${placeholder}`);
  await page.close();
});

check("Stopped with something kept: Gala's line alone, with no rule and no button", async () => {
  const page = await open("/preview/stopped?top=1");
  const notice = await page.$eval('[data-name="gala-notice"]', (element) => ({
    kind: element.dataset.kind,
    text: element.textContent,
    buttons: element.querySelectorAll("button").length,
    rule: getComputedStyle(element.querySelector('[data-name="notice"]')).borderLeftWidth,
  }));
  expect(notice.kind === "Stopped" && notice.text.includes("Stopped. Tell me what to do next.") && notice.buttons === 0 && notice.rule === "0px", `the notice: ${JSON.stringify(notice)}`);
  await page.close();
});

check("Stopped with nothing kept: the line, no rule, and one secondary Try again", async () => {
  const page = await open("/preview/stoppedRetry?top=1");
  const notice = await page.$eval('[data-name="gala-notice"]', (element) => ({
    kind: element.dataset.kind,
    text: element.querySelector("p.type-body-regular")?.textContent ?? null,
    buttons: [...element.querySelectorAll("button")].map((button) => [button.dataset.name, button.textContent]),
    rule: getComputedStyle(element.querySelector('[data-name="notice"]')).borderLeftWidth,
  }));
  expect(
    notice.kind === "Stopped" && notice.text === "Stopped. Nothing from that turn was kept. Try again, or tell me what to do next." && JSON.stringify(notice.buttons) === JSON.stringify([["button-secondary", "Try again"]]) && notice.rule === "0px",
    `the notice: ${JSON.stringify(notice)}`,
  );
  await page.close();
});

check("Back while working: the Work panel's done rows say Back to this step when I finish, and offer no button", async () => {
  const page = await open("/preview/backWhileWorking?top=1&panel=historyWorking");
  const rows = await page.$$eval('[data-name="gala-phase-row"]', (elements) =>
    elements.map((row) => ({ waiting: row.querySelector('[data-name="go-back-waiting"]')?.textContent ?? null, button: row.querySelector('[data-name="go-back"]') !== null })),
  );
  const done = rows.filter((row) => row.waiting !== null);
  expect(done.length === 4 && done.every((row) => row.waiting === "Back to this step when I finish") && !rows.some((row) => row.button), `the rows: ${JSON.stringify(rows)}`);
  await page.close();
});

check("Back while working: a past card's footer waits too, with the same words", async () => {
  const page = await open("/preview/history?busy=1", 1440, 1040);
  const footers = await page.$$eval('[data-name="gala-card-footer"]', (elements) => elements.map((footer) => ({ waiting: footer.querySelector('[data-name="back-waiting"]')?.textContent, button: footer.querySelector("button") !== null })));
  expect(footers.length === 2 && footers.every((footer) => footer.waiting === "Back to this step when I finish" && !footer.button), `the footers: ${JSON.stringify(footers)}`);
  await page.close();
});

check("Downloads: Saved with a check, Saving with the thinking mark and not pressable, Couldn't with a retry in the button", async () => {
  const page = await open("/preview/kit?top=1&downloads=SVG:saved,EPS:saving,PNG:couldnt");
  const chips = await page.$$eval('[data-name="gala-kit"] [data-name="gala-download-chip"]', (elements) =>
    elements.map((chip) => ({ state: chip.dataset.state, text: chip.textContent, disabled: chip.disabled, thinking: chip.querySelector('[data-name="thinking"]') !== null, check: chip.querySelector("svg") !== null, border: getComputedStyle(chip).borderTopColor })),
  );
  const [svg, eps, png, square] = chips;
  expect(svg.state === "saved" && svg.check && svg.text === "SVG", `SVG: ${JSON.stringify(svg)}`);
  expect(eps.state === "saving" && eps.thinking && eps.disabled, `EPS: ${JSON.stringify(eps)}`);
  expect(png.state === "couldnt" && png.text === "PNG · Try again" && !png.disabled && png.border === "rgb(227, 99, 22)", `PNG: ${JSON.stringify(png)}`);
  expect(square.state === "idle" && square.text === "Square", `Square: ${JSON.stringify(square)}`);
  await page.close();
});

check("download reports a file it can't fetch, instead of throwing", async () => {
  const page = await open("/preview/kit?top=1");
  // Storage answers a file that is gone with a 404; here the test browser answers for it.
  await page.setRequestInterception(true);
  page.on("request", (request) => (request.url().includes("/gone-file.zip") ? request.respond({ status: 404, body: "" }) : request.continue()));
  const results = await page.evaluate(async () => {
    const { download } = await import("/src/lib/turn.ts");
    return { missing: await download(`${location.origin}/gone-file.zip`, "kit.zip").catch((error) => `threw: ${error}`), unreachable: await download("http://127.0.0.1:9/kit.zip", "kit.zip").catch((error) => `threw: ${error}`) };
  });
  expect(results.missing === false && results.unreachable === false, `the results: ${JSON.stringify(results)}`);
  await page.close();
});

let passed = 0;
console.log(`Small feedback, as drawn (${BASE}): ${checks.length} checks`);
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
