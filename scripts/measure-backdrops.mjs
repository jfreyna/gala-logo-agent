#!/usr/bin/env node
/**
 * What the backdrops cost per frame, on a throttled phone profile.
 *
 *   GALA_PREVIEW_URL=http://localhost:3002 node scripts/measure-backdrops.mjs
 *
 * Each case opens a page in a phone-sized window (380 by 812, three device
 * pixels to one, touch) with the processor slowed four times, which is the
 * "mid-tier mobile" setting in Chrome's performance tools. It records a
 * performance trace for a few seconds and reads from it:
 *
 *   - the time the page's main thread was busy, per frame drawn;
 *   - the same for the compositor thread, which moves the finished layers;
 *   - how many times anything was laid out or painted again.
 *
 * The budget is 2 milliseconds of main-thread time per frame for a backdrop
 * by itself. The whole pages are measured too, for context: they hold other
 * moving things (the hall rows), so they are reported and not held to it.
 *
 * What it proves: the backdrops' motion asks almost nothing of the main
 * thread, because it is all transform and opacity on finished layers.
 * What it does not prove: the cost on a real phone's graphics chip. A
 * headless browser on this machine draws with its own renderer, so the
 * time to blend the layers on a phone is not measured here. The frame
 * count is the trace's own count of frames drawn.
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.GALA_PREVIEW_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BUDGET_MS = 2;
const SLOWDOWN = 4;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * name, address, whether the 2 ms budget applies, and what to do while the
 * trace records. The backdrops are drawn at the width they have on a phone:
 * the hero's stage is 1152 wide there, the halls' 518.4, About's 1728.
 */
const CASES = [
  { name: "hero glows, breathing", path: "/preview/backdrop?scene=hero-silk&width=1152", budget: true, during: () => wait(5000) },
  { name: "halls scene, floating and sweeping", path: "/preview/backdrop?scene=halls-horizon&width=518.4", budget: true, settle: 4500, during: () => wait(5000) },
  {
    name: "halls scene, while the page scrolls under a finger",
    path: "/preview/backdrop?scene=halls-horizon&width=518.4&below=500",
    budget: true,
    // Bring the scene on screen and let its entrance finish before measuring.
    before: (page) => page.evaluate(() => window.scrollTo(0, 200)),
    settle: 4500,
    during: async (page, session) => {
      for (const distance of [-420, 420, -420, 420]) {
        await session.send("Input.synthesizeScrollGesture", { x: 190, y: 600, yDistance: distance, speed: 300, gestureSourceType: "touch" });
      }
    },
  },
  { name: "About ribbons, breathing and sweeping", path: "/preview/backdrop?scene=about-ribbons&width=1728", budget: true, settle: 1500, during: () => wait(6000) },
  { name: "the whole home page, top", path: "/preview/home", budget: false, during: () => wait(5000) },
  {
    name: "the whole home page, at the halls",
    path: "/preview/home",
    budget: false,
    before: (page) => page.evaluate(() => document.querySelector('[data-name="backdrop/halls-horizon"]').scrollIntoView({ block: "center" })),
    settle: 4500,
    during: () => wait(5000),
  },
  { name: "the whole About page", path: "/about", budget: false, settle: 1500, during: () => wait(6000) },
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars"] });

async function measure(testCase) {
  const page = await browser.newPage();
  await page.setViewport({ width: 380, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
  await page.goto(BASE + testCase.path, { waitUntil: "networkidle0" });
  if (testCase.before) await testCase.before(page);
  await wait(testCase.settle ?? 800);
  const animating = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length);
  await page.emulateCPUThrottling(SLOWDOWN);
  const session = await page.createCDPSession();
  await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame"] });
  const started = Date.now();
  await testCase.during(page, session);
  const seconds = (Date.now() - started) / 1000;
  const trace = JSON.parse(Buffer.from(await page.tracing.stop()).toString("utf8"));
  await page.close();

  const events = trace.traceEvents;
  // The page's own threads: its main thread and its compositor.
  const threads = new Map();
  for (const event of events) if (event.name === "thread_name") threads.set(`${event.pid}/${event.tid}`, event.args.name);
  const on = (event, thread) => threads.get(`${event.pid}/${event.tid}`) === thread;
  const busy = (thread) => events.filter((event) => event.ph === "X" && event.name === "RunTask" && on(event, thread)).reduce((sum, event) => sum + (event.dur ?? 0), 0) / 1000;
  const count = (name) => events.filter((event) => event.name === name && on(event, "CrRendererMain")).length;
  const frames = events.filter((event) => event.name === "DrawFrame").length;
  return {
    seconds,
    animating,
    frames,
    main: busy("CrRendererMain") / frames,
    compositor: busy("Compositor") / frames,
    layouts: count("Layout"),
    paints: count("Paint"),
    styles: count("UpdateLayoutTree"),
  };
}

let passed = 0;
let held = 0;
let ran = 0;
console.log(`Phone window 380 x 812 at 3x, processor slowed ${SLOWDOWN}x. Budget for a backdrop by itself: ${BUDGET_MS} ms of main-thread time per frame.\n`);
for (const testCase of CASES) {
  ran++;
  try {
    const result = await measure(testCase);
    const line = `main thread ${result.main.toFixed(2)} ms per frame, compositor ${result.compositor.toFixed(2)} ms per frame; ${result.frames} frames in ${result.seconds.toFixed(1)} s, ${result.animating} animations running; ${result.layouts} layouts, ${result.paints} paints, ${result.styles} style passes`;
    if (testCase.budget) {
      held++;
      // A run with no frames or nothing animating measured nothing, and does not pass.
      const ok = result.frames > 0 && result.animating > 0 && result.main < BUDGET_MS;
      if (ok) passed++;
      console.log(`${ok ? "pass" : "FAIL"}  ${testCase.name}\n        ${line}`);
    } else {
      console.log(`info  ${testCase.name}\n        ${line}`);
    }
  } catch (error) {
    if (testCase.budget) held++;
    console.log(`FAIL  ${testCase.name}: ${error.message.split("\n")[0]}`);
  }
}
await browser.close();
const expected = CASES.filter((testCase) => testCase.budget).length;
console.log(ran === CASES.length && held === expected ? `\n${passed}/${expected} passed` : `\n${passed}/${expected}, run incomplete`);
process.exit(passed === expected ? 0 : 1);
