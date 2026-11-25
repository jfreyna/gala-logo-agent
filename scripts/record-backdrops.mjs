#!/usr/bin/env node
/**
 * Short screen recordings of the animated backdrops, as WebM files.
 *
 *   GALA_PREVIEW_URL=http://localhost:3002 node scripts/record-backdrops.mjs [output folder, default recordings]
 *
 * The recordings are not kept in the repository (the folder is ignored): they
 * are posted with the pull request that changes the motion.
 *
 * It opens each page in a headless browser, captures what the screen shows
 * while the scene plays, and plays those captures back onto a canvas that
 * the browser itself records as video. Nothing but Chrome is needed.
 *
 * What a recording shows: the motion as this Chrome draws it on this
 * machine, at the pace it happened. What it does not show: how smooth it is
 * on a phone. The captures arrive at up to 30 a second, so a recording is
 * no measure of frame rate.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.env.GALA_PREVIEW_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = process.argv[2] ?? "recordings";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Moves the pointer along a line over a stretch of time, as a hand would. */
async function glide(page, from, to, ms) {
  const steps = Math.round(ms / 40);
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const eased = t * t * (3 - 2 * t);
    await page.mouse.move(from[0] + (to[0] - from[0]) * eased, from[1] + (to[1] - from[1]) * eased);
    await wait(40);
  }
}

/** Scrolls the page smoothly by a distance over a stretch of time. */
async function drift(page, distance, ms) {
  const steps = Math.round(ms / 32);
  let done = 0;
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const goal = Math.round(distance * t * t * (3 - 2 * t));
    await page.mouse.wheel({ deltaY: goal - done });
    done = goal;
    await wait(32);
  }
}

const CLIPS = [
  {
    name: "hero-glows",
    path: "/preview/home?pin=1",
    window: [1440, 850],
    // Ten seconds: one whole breath of each glow.
    play: () => wait(10000),
  },
  {
    name: "halls-horizon",
    path: "/preview/home?pin=1",
    window: [1440, 850],
    // Start with the halls just below the window, scroll them in so the entrance plays, then watch, then move a pointer across.
    before: (page) => page.evaluate(() => window.scrollTo(0, 60)),
    play: async (page) => {
      await drift(page, 520, 1400);
      await wait(5200);
      await glide(page, [1300, 300], [140, 420], 2200);
      await glide(page, [140, 420], [1300, 260], 2200);
      await drift(page, 220, 1200);
      await wait(800);
    },
  },
  {
    name: "about-ribbons",
    path: "/about",
    window: [1440, 850],
    // Twenty seconds: the top ribbon is swept, then the middle one, and the glows breathe throughout.
    play: () => wait(19000),
  },
  {
    name: "halls-horizon-phone",
    path: "/preview/home",
    window: [380, 812],
    scale: 2,
    phone: true,
    before: (page) => page.evaluate(() => window.scrollTo(0, 60)),
    play: async (page, session) => {
      await session.send("Input.synthesizeScrollGesture", { x: 190, y: 600, yDistance: -430, speed: 420, gestureSourceType: "touch" });
      await wait(6000);
      await session.send("Input.synthesizeScrollGesture", { x: 190, y: 500, yDistance: -160, speed: 160, gestureSourceType: "touch" });
      await wait(1500);
    },
  },
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars"] });
await mkdir(outDir, { recursive: true });

/** Captures the screen while `play` runs: a list of JPEG pictures, each with the time it was shown. */
async function capture(clip) {
  const page = await browser.newPage();
  const scale = clip.scale ?? 1;
  await page.setViewport({ width: clip.window[0], height: clip.window[1], deviceScaleFactor: scale, isMobile: Boolean(clip.phone), hasTouch: Boolean(clip.phone) });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "no-preference" }]);
  await page.goto(BASE + clip.path, { waitUntil: "networkidle0" });
  if (clip.before) await clip.before(page);
  await wait(300);
  const session = await page.createCDPSession();
  const pictures = [];
  session.on("Page.screencastFrame", (frame) => {
    pictures.push({ at: frame.metadata.timestamp, data: frame.data });
    session.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => undefined);
  });
  await session.send("Page.startScreencast", { format: "jpeg", quality: 85, everyNthFrame: 2 });
  await clip.play(page, session);
  await session.send("Page.stopScreencast");
  await page.close();
  const start = pictures[0]?.at ?? 0;
  return pictures.map((picture) => ({ at: Math.round((picture.at - start) * 1000), data: picture.data }));
}

/** Plays the pictures back at their own pace onto a canvas, and has the browser record the canvas. */
async function encode(pictures, width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><body style="margin:0"><canvas id="c" width="${width}" height="${height}"></canvas></body>`);
  const video = await page.evaluate(
    async (pictures, width, height) => {
      const context = document.getElementById("c").getContext("2d");
      const images = await Promise.all(
        pictures.map(async (picture) => {
          const image = new Image();
          image.src = `data:image/jpeg;base64,${picture.data}`;
          await image.decode();
          return image;
        }),
      );
      context.drawImage(images[0], 0, 0, width, height);
      const stream = document.getElementById("c").captureStream(30);
      const type = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_500_000 });
      const chunks = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const stopped = new Promise((resolve) => (recorder.onstop = resolve));
      recorder.start();
      const began = performance.now();
      for (let index = 0; index < images.length; index++) {
        const due = began + pictures[index].at;
        const pause = due - performance.now();
        if (pause > 0) await new Promise((resolve) => setTimeout(resolve, pause));
        context.drawImage(images[index], 0, 0, width, height);
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      recorder.stop();
      await stopped;
      const bytes = new Uint8Array(await new Blob(chunks, { type }).arrayBuffer());
      let text = "";
      for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { type, base64: btoa(text) };
    },
    pictures,
    width,
    height,
  );
  await page.close();
  return video;
}

let made = 0;
for (const clip of CLIPS) {
  const pictures = await capture(clip);
  if (pictures.length < 10) {
    console.log(`${clip.name}: only ${pictures.length} pictures were captured; no recording written`);
    continue;
  }
  // Desktop clips are written at two thirds of the window's size; the phone clip at the phone's own size.
  const [width, height] = clip.phone ? clip.window : [960, Math.round((clip.window[1] * 960) / clip.window[0])];
  const video = await encode(pictures, width, height);
  const file = join(outDir, `${clip.name}.webm`);
  await writeFile(file, Buffer.from(video.base64, "base64"));
  made++;
  console.log(`${file}: ${(pictures.at(-1).at / 1000).toFixed(1)} s, ${pictures.length} pictures, ${width} x ${height}, ${(Buffer.from(video.base64, "base64").length / 1024).toFixed(0)} KB (${video.type})`);
}
await browser.close();
console.log(made === CLIPS.length ? `\n${made}/${CLIPS.length} recordings written` : `\n${made}/${CLIPS.length}, run incomplete`);
process.exit(made === CLIPS.length ? 0 : 1);
