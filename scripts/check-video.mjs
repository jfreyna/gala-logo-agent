#!/usr/bin/env node
/**
 * Checks the home page's video against the built app as the real server
 * sends it (node server/index.mjs, port 8080), so the production
 * Content-Security-Policy is in force. The Vite dev server sends no such
 * headers, which is why this does not run against port 3000.
 *
 * What it proves: the page asks YouTube's privacy-enhanced player for the
 * video with autoplay, mute, inline play and loop set; the server's policy
 * lets that one origin into a frame and the browser loads it without a
 * policy violation; the section sits between the hero and the halls; and
 * the frame keeps 16:9, stops at 1080 wide and never pushes the page
 * sideways at 380, 768, 1024, 1440 and 1920 wide.
 *
 * What it does not prove: that the video starts playing on every device
 * (Low Power Mode on an iPhone and some data-saver settings block autoplay,
 * and those visitors see YouTube's cover with a play button), or how
 * YouTube's own player shows and hides its controls. It also proves nothing
 * at widths it does not measure.
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.GALA_SERVER_URL ?? "http://localhost:8080";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VIDEO_ORIGIN = "https://www.youtube-nocookie.com";
const VIDEO_ID = "XZ4PGqv5Zyg";

// The server has to be up before anything here says something about the page.
try {
  const response = await fetch(BASE + "/");
  if (!response.ok) throw new Error(`status ${response.status}`);
} catch (error) {
  console.log(`harness: could not reach ${BASE} (${error.message}). Nothing was checked; no claim about the page.`);
  process.exit(2);
}

const checks = [];
const check = (name, run) => checks.push({ name, run });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars"] });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Opens the home page at a width, recording any policy violation the page reports. */
async function open(width, height = 900) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  const violations = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await page.evaluateOnNewDocument(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (event) => window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  const response = await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForSelector('[data-name="video"] iframe');
  // Give the frame time to load, or to be refused.
  await wait(2500);
  violations.push(...(await page.evaluate(() => window.__violations)));
  return { page, response, violations };
}

check("the server's policy lets YouTube's privacy-enhanced player into a frame, and still keeps other sites from framing Gala", async () => {
  const response = await fetch(BASE + "/");
  const policy = response.headers.get("content-security-policy") ?? "";
  const directives = policy.split(";").map((part) => part.trim());
  return (
    directives.includes(`frame-src ${VIDEO_ORIGIN}`) &&
    directives.includes("frame-ancestors 'none'") &&
    response.headers.get("x-frame-options") === "DENY"
  );
});

check("the page has exactly one frame, YouTube's privacy-enhanced player with autoplay, mute, inline play and loop", async () => {
  const { page } = await open(1440);
  const sources = await page.evaluate(() => [...document.querySelectorAll("iframe")].map((frame) => frame.src));
  if (sources.length !== 1) return false;
  const url = new URL(sources[0]);
  const query = url.searchParams;
  return (
    url.origin === VIDEO_ORIGIN &&
    url.pathname === `/embed/${VIDEO_ID}` &&
    query.get("autoplay") === "1" &&
    query.get("mute") === "1" &&
    query.get("playsinline") === "1" &&
    query.get("loop") === "1" &&
    query.get("playlist") === VIDEO_ID &&
    !query.has("si")
  );
});

check("the browser loads the player with no policy violation", async () => {
  const { page, violations } = await open(1440);
  const loaded = page.frames().some((frame) => frame.url().startsWith(`${VIDEO_ORIGIN}/embed/${VIDEO_ID}`));
  if (violations.length > 0) console.log(`      violations: ${violations.join(" | ")}`);
  return loaded && violations.length === 0;
});

for (const width of [1440, 380]) {
  check(`at ${width} wide the video section sits directly after the hero and before the halls`, async () => {
    const { page } = await open(width);
    return page.evaluate(() => {
      const video = document.querySelector('section[data-name="video"]');
      const hero = document.querySelector("section.hero");
      const halls = document.querySelector('section[data-name="halls"]');
      const visible = video.getBoundingClientRect().height > 0;
      return visible && video.previousElementSibling === hero && video.nextElementSibling === halls && hero.getBoundingClientRect().bottom <= video.getBoundingClientRect().top + 0.5 && video.getBoundingClientRect().bottom <= halls.getBoundingClientRect().top + 0.5;
    });
  });
}

for (const width of [380, 768, 1024, 1440, 1920]) {
  check(`at ${width} wide the frame is 16:9, at most 1080 wide and inside the side padding, and the page does not scroll sideways`, async () => {
    const { page } = await open(width);
    const sizes = await page.evaluate(() => {
      const box = document.querySelector('[data-name="video"] iframe').getBoundingClientRect();
      return { width: box.width, height: box.height, viewport: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth };
    });
    const padding = sizes.viewport >= 768 ? 40 : 16;
    const expected = Math.min(1080, sizes.viewport - 2 * padding);
    const ok =
      sizes.width <= 1080 &&
      sizes.width <= sizes.viewport - 2 * padding + 0.5 &&
      Math.abs(sizes.width - expected) <= 0.5 &&
      Math.abs(sizes.height - (sizes.width * 9) / 16) <= 1 &&
      sizes.scrollWidth <= sizes.innerWidth;
    console.log(`      ${width}: frame ${sizes.width} x ${sizes.height}, page ${sizes.scrollWidth} of ${sizes.innerWidth}`);
    return ok;
  });
}

let passed = 0;
let ran = 0;
for (const { name, run } of checks) {
  let ok = false;
  let note = "";
  try {
    ok = (await run()) === true;
  } catch (error) {
    note = ` (${String(error.message ?? error).slice(0, 120)})`;
  }
  ran++;
  if (ok) passed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${note}`);
}
await browser.close();

const expected = checks.length;
console.log(ran === expected ? `\n${passed}/${expected} passed` : `\n${passed}/${ran}, run incomplete`);
process.exit(passed === expected ? 0 : 1);
