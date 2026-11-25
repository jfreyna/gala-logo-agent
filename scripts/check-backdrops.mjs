#!/usr/bin/env node
/**
 * The backdrops, checked in a headless browser against the dev server.
 *
 *   GALA_PREVIEW_URL=http://localhost:3002 node scripts/check-backdrops.mjs <folder of frame PNGs> [folder for the difference pictures]
 *
 * The frame PNGs are the ones the visual gate uses (intro-desktop-light.png
 * and so on, exported from Figma at the frame's own size), plus
 * hero-silk-light.png and hero-silk-dark.png: the hero's glow layer exported
 * alone (nodes 5595:14206 and 5595:14246), since the hero's text and dots
 * cover it in the full frame.
 *
 * Two kinds of check.
 *
 * At rest: with the system asking for reduced motion, each backdrop is drawn
 * alone and compared with Figma's own rendering, pixel by pixel, wherever the
 * frame shows the backdrop with nothing over it. Nothing may move.
 *
 * In motion: what moves, when, and what never does. Only transform and
 * opacity animate. Loops run while a scene is on screen and pause when it is
 * not. The halls wait for their entrance. A pointer moves things only where
 * there is a fine pointer.
 *
 * What it does not prove: how the motion looks or feels (the recordings are
 * for that), frame time (scripts/measure-backdrops.mjs), or any browser but
 * this Chrome. At rest, it does not see the middle of the About backdrop
 * (the page's column covers it in the frame) or the lowest 93 pixels of the
 * halls scene (the hall rows cover them); the visual gate compares those as
 * part of the whole page, more loosely.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.env.GALA_PREVIEW_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [framesDir, outDir = null] = process.argv.slice(2);
if (!framesDir) {
  console.error("Usage: node scripts/check-backdrops.mjs <folder of frame PNGs> [folder for the difference pictures]");
  process.exit(2);
}

const PAGE_COLOR = { light: "#f6fafc", dark: "#021c29" };
const MODES = ["light", "dark"];

/**
 * Where each backdrop can be seen bare in Figma's rendering. `frame` names
 * the PNG, `down` is how far down that PNG the scene starts, and `bare`
 * lists the rectangles of the scene (x, y, width, height, in frame pixels)
 * with nothing drawn over them.
 */
const SCENES = [
  { name: "hero-silk", height: 850, frame: (mode) => `hero-silk-${mode}.png`, down: 0, bare: [[0, 0, 1440, 850]] },
  // The halls start 850 down the page; the hall rows begin 430 into the scene.
  { name: "halls-horizon", height: 523, frame: (mode) => `intro-desktop-${mode}.png`, down: 850, bare: [[0, 0, 1440, 430]] },
  // Under the 64-pixel header, to either side of the 768-pixel column.
  { name: "about-ribbons", height: 1346, frame: (mode) => `about-desktop-${mode}.png`, down: 0, bare: [[0, 64, 336, 1282], [1104, 64, 336, 1282]] },
];

/**
 * How close "the same" is, at rest. Colors are compared channel by channel,
 * 0 to 255. Figma and a browser do not draw a blur or a curve's edge
 * identically, so the bar is: at least 99.5% of the bare pixels within 6
 * levels. The largest difference and the mean are printed beside it.
 */
const NEAR = 6;
const NEAR_SHARE_NEEDED = 0.995;

const checks = [];
const check = (name, run) => checks.push({ name, run });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars", "--force-device-scale-factor=1"] });
if (outDir !== null) await mkdir(outDir, { recursive: true });

async function open(path, { mode = "light", reducedMotion = false, width = 1440, height = 900, touch = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: mode },
    { name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" },
  ]);
  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  await wait(150);
  return page;
}

/** Compares the built scene with Figma's rendering inside the bare rectangles. */
async function compare(scene, mode, builtPng, framePng) {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><body><img id="a" src="data:image/png;base64,${framePng.toString("base64")}"><img id="b" src="data:image/png;base64,${builtPng.toString("base64")}"><canvas id="d"></canvas></body>`);
  const result = await page.evaluate(
    async (height, down, bare, under, near) => {
      const [frame, built] = [document.getElementById("a"), document.getElementById("b")];
      await Promise.all([frame.decode(), built.decode()]);
      const pixels = (image, sourceY) => {
        const canvas = document.createElement("canvas");
        [canvas.width, canvas.height] = [1440, height];
        const context = canvas.getContext("2d");
        // The page color goes under a layer exported with a clear background.
        context.fillStyle = under;
        context.fillRect(0, 0, 1440, height);
        context.drawImage(image, 0, sourceY, 1440, height, 0, 0, 1440, height);
        return context.getImageData(0, 0, 1440, height).data;
      };
      const [pa, pb] = [pixels(frame, down), pixels(built, 0)];
      const canvas = document.getElementById("d");
      [canvas.width, canvas.height] = [1440, height];
      const context = canvas.getContext("2d");
      const picture = context.createImageData(1440, height);
      // Outside the bare rectangles the picture is dark blue: not compared.
      for (let i = 0; i < picture.data.length; i += 4) picture.data.set([0, 0, 60, 255], i);
      let [largest, total, within, count] = [0, 0, 0, 0];
      for (const [x0, y0, w, h] of bare) {
        for (let y = y0; y < y0 + h; y++) {
          for (let x = x0; x < x0 + w; x++) {
            const i = (y * 1440 + x) * 4;
            const difference = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
            largest = Math.max(largest, difference);
            total += difference;
            count++;
            if (difference <= near) within++;
            // Black where the two agree, brighter the further apart (times 16, so a few levels can be seen).
            const shade = Math.min(255, difference * 16);
            picture.data.set([shade, shade, shade, 255], i);
          }
        }
      }
      context.putImageData(picture, 0, 0);
      return { largest, mean: total / count, withinShare: within / count, count, picture: canvas.toDataURL("image/png").split(",")[1] };
    },
    scene.height,
    scene.down,
    scene.bare,
    PAGE_COLOR[mode],
    NEAR,
  );
  await page.close();
  return result;
}

for (const scene of SCENES) {
  for (const mode of MODES) {
    check(`at rest: ${scene.name}, ${mode}, matches Figma's rendering where the frame shows it bare`, async () => {
      const page = await open(`/preview/backdrop?scene=${scene.name}`, { mode, reducedMotion: true, height: scene.height });
      const builtPng = await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: scene.height } });
      await page.close();
      const result = await compare(scene, mode, builtPng, await readFile(join(framesDir, scene.frame(mode))));
      if (outDir !== null) {
        await writeFile(join(outDir, `${scene.name}-${mode}-built.png`), builtPng);
        await writeFile(join(outDir, `${scene.name}-${mode}-difference.png`), Buffer.from(result.picture, "base64"));
      }
      const note = `${(result.withinShare * 100).toFixed(2)}% of ${result.count} pixels within ${NEAR} of 255, largest difference ${result.largest}, mean ${result.mean.toFixed(2)}`;
      return [result.withinShare >= NEAR_SHARE_NEEDED, note];
    });
  }
}

/** What is animating on the page: each animation's name, state, timing, and the properties its keyframes set. */
const animations = (page) =>
  page.evaluate(() =>
    document.getAnimations().map((animation) => {
      const timing = animation.effect.getComputedTiming();
      const keyframes = animation.effect.getKeyframes();
      const target = animation.effect.target;
      return {
        name: animation.animationName ?? "(not a CSS animation)",
        state: animation.playState,
        duration: timing.duration,
        delay: timing.delay,
        time: animation.currentTime,
        piece: [...target.classList].filter((name) => name.startsWith("bd-")).join(" ") || target.parentElement.className,
        properties: [...new Set(keyframes.flatMap((keyframe) => Object.keys(keyframe)))].filter((key) => !["offset", "computedOffset", "easing", "composite"].includes(key)),
        middle: keyframes.find((keyframe) => keyframe.computedOffset === 0.5) ?? null,
      };
    }),
  );

/** How far a piece is moved right now, in pixels: its `translate`, and the vertical part of its `transform`. */
const moved = (page, selector) =>
  page.$$eval(selector, (pieces) =>
    pieces.map((piece) => {
      const style = getComputedStyle(piece);
      const [x = 0, y = 0] = style.translate === "none" ? [] : style.translate.split(" ").map(parseFloat);
      return { translate: [x, y], lift: style.transform === "none" ? 0 : new DOMMatrixReadOnly(style.transform).f, opacity: Number(style.opacity), willChange: style.willChange };
    }),
  );

/**
 * Where each piece is at the middle of its loop (the top of a bob), read from
 * the browser itself: every animation of that name is held at its halfway
 * point, and the piece's drawn transform and opacity are read back in pixels.
 */
const atTheTop = (page, name) =>
  page.evaluate((name) => {
    const found = document.getAnimations().filter((animation) => animation.animationName === name);
    for (const animation of found) {
      const timing = animation.effect.getComputedTiming();
      animation.pause();
      animation.currentTime = timing.delay + timing.duration / 2;
    }
    return found.map((animation) => {
      const style = getComputedStyle(animation.effect.target);
      const matrix = new DOMMatrixReadOnly(style.transform);
      return { rise: Math.round(-matrix.f * 100) / 100, width: Math.round(matrix.a * 1000) / 1000, opacity: Number(style.opacity) };
    });
  }, name);

const sceneState = (page) => page.$eval(".bd", (box) => ({ motion: box.dataset.motion, inView: box.dataset.inview, phase: box.dataset.phase }));

/** The halls' entrance lasts 3.5 seconds; after this long on screen the scene is idle. */
const ENTERED = 4000;

check("reduced motion: no backdrop runs any animation, and nothing moves", async () => {
  const notes = [];
  for (const scene of SCENES) {
    const page = await open(`/preview/backdrop?scene=${scene.name}`, { reducedMotion: true, height: scene.height });
    const running = await animations(page);
    const state = await sceneState(page);
    const first = await page.screenshot({ encoding: "base64" });
    // Move a pointer and scroll too: neither may shift anything.
    await page.mouse.move(100, 100);
    await page.mouse.move(1300, 400, { steps: 8 });
    await wait(1200);
    const second = await page.screenshot({ encoding: "base64" });
    await page.close();
    if (running.length !== 0 || state.motion !== "off" || first !== second) return [false, `${scene.name}: ${running.length} animations, motion ${state.motion}, pictures ${first === second ? "equal" : "differ"}`];
    notes.push(scene.name);
  }
  return [true, `${notes.join(", ")}: 0 animations each, two pictures 1.2 s apart identical`];
});

check("motion: only transform and opacity are ever animated", async () => {
  const seen = new Set();
  const names = new Set();
  // The halls are looked at twice: during their entrance (scrolled into view a moment ago), and once idle.
  for (const [path, height, pause] of [
    ["/preview/backdrop?scene=hero-silk", 850, 300],
    ["/preview/backdrop?scene=halls-horizon&below=1200", 900, 300],
    ["/preview/backdrop?scene=halls-horizon", 523, ENTERED],
    ["/preview/backdrop?scene=about-ribbons", 1346, 300],
  ]) {
    const page = await open(path, { height });
    await page.evaluate(() => document.querySelector(".bd").scrollIntoView({ block: "center" }));
    await wait(pause);
    for (const animation of await animations(page)) {
      names.add(animation.name);
      for (const property of animation.properties) seen.add(property);
    }
    await page.close();
  }
  const others = [...seen].filter((property) => property !== "transform" && property !== "opacity");
  // Every keyframe set in backdrops.css must have been seen running, or the check looked at too little.
  const all = ["bd-breathe", "bd-drift", "bd-float", "bd-settle", "bd-shadow", "bd-shadow-in", "bd-sweep", "bd-sweep-turn"];
  return [[...names].sort().join() === all.join() && others.length === 0, `the ${names.size} kinds of animation (${[...names].sort().join(", ")}) set: ${[...seen].sort().join(", ")}`];
});

check("hero: three glows breathe on a 10-second loop, each at its own point in it, between 70% and 90% opacity", async () => {
  const page = await open("/preview/backdrop?scene=hero-silk", { height: 850 });
  const running = (await animations(page)).filter((animation) => animation.name === "bd-breathe");
  const glows = await moved(page, ".bd-glow");
  await page.close();
  // Each glow starts part of the way into its loop (a negative delay), so its place in the loop is the time run less that delay.
  const phases = running.map((animation) => Math.round(((animation.time - animation.delay) % 10000) / 100) / 10);
  const apart = new Set(phases.map((phase) => Math.round(phase))).size === 3;
  const ok = running.length === 3 && running.every((animation) => animation.state === "running" && animation.duration === 10000) && apart && glows.every((glow) => glow.opacity >= 0.7 && glow.opacity <= 0.9);
  return [ok, `${running.length} running, ${phases.join(" s, ")} s into the loop, opacity ${glows.map((glow) => glow.opacity.toFixed(2)).join(", ")}`];
});

check("off screen: the loops are paused and the layers are not promoted; on screen they run and are", async () => {
  // The scene sits 2000 pixels down a 900-pixel window.
  const page = await open("/preview/backdrop?scene=hero-silk&below=2000", { height: 900 });
  const off = { state: await sceneState(page), running: await animations(page), glows: await moved(page, ".bd-glow") };
  await page.evaluate(() => window.scrollTo(0, 2000));
  await wait(400);
  const on = { state: await sceneState(page), running: await animations(page), glows: await moved(page, ".bd-glow") };
  await page.close();
  const ok =
    off.state.inView === "false" && off.running.every((animation) => animation.state === "paused") && off.glows.every((glow) => glow.willChange === "auto") &&
    on.state.inView === "true" && on.running.every((animation) => animation.state === "running") && on.glows.every((glow) => glow.willChange.includes("transform"));
  return [ok && off.running.length === 3, `off screen: ${off.running.map((animation) => animation.state).join(", ")}, will-change ${off.glows[0].willChange}; on screen: ${on.running.map((animation) => animation.state).join(", ")}, will-change ${on.glows[0].willChange}`];
});

check("halls: the spheres wait 20 pixels up until a fifth of the scene is on screen, settle in, and then float", async () => {
  const page = await open("/preview/backdrop?scene=halls-horizon&below=1200", { height: 900 });
  const before = { state: await sceneState(page), spheres: await moved(page, ".bd-sphere"), running: (await animations(page)).length };
  // Bring 60 of the scene's 523 pixels on screen: under a fifth.
  await page.evaluate(() => window.scrollTo(0, 1200 - 900 + 60));
  await wait(400);
  const peeking = await sceneState(page);
  // Then all of it: the entrance plays.
  await page.evaluate(() => window.scrollTo(0, 1200 - 150));
  await wait(500);
  const entering = { state: await sceneState(page), names: [...new Set((await animations(page)).map((animation) => animation.name))].sort() };
  await wait(ENTERED);
  const after = { state: await sceneState(page), running: await animations(page) };
  await page.close();
  const floats = after.running.filter((animation) => animation.name === "bd-float");
  const shadows = after.running.filter((animation) => animation.name === "bd-shadow");
  const ok =
    before.state.phase === "waiting" && before.running === 0 && before.spheres.every((sphere) => Math.abs(sphere.lift + 20) < 0.01) &&
    peeking.phase === "waiting" &&
    entering.state.phase === "entering" && entering.names.join() === "bd-settle,bd-shadow-in,bd-sweep" &&
    after.state.phase === "idle" && floats.length === 3 && shadows.length === 3 && floats.every((animation) => animation.state === "running");
  return [ok, `waiting: lifted ${before.spheres.map((sphere) => sphere.lift.toFixed(1)).join(", ")} px, ${before.running} animations; at 60 px showing: ${peeking.phase}; entering: ${entering.names.join(", ")}; idle: ${floats.length} floats, ${shadows.length} shadows running`];
});

check("no piece ever has two animations at once, so each can run on the compositor", async () => {
  const worst = [];
  for (const [name, path, height, pause] of [["hero-silk", "/preview/backdrop?scene=hero-silk", 850, 300], ["halls-horizon, entering", "/preview/backdrop?scene=halls-horizon", 523, 500], ["halls-horizon, idle", "/preview/backdrop?scene=halls-horizon", 523, ENTERED], ["about-ribbons", "/preview/backdrop?scene=about-ribbons", 1346, 300]]) {
    const page = await open(path, { height });
    await wait(pause);
    const most = await page.evaluate(() => {
      const counts = new Map();
      for (const animation of document.getAnimations()) counts.set(animation.effect.target, (counts.get(animation.effect.target) ?? 0) + 1);
      return Math.max(0, ...counts.values());
    });
    await page.close();
    worst.push(`${name}: ${most}`);
    if (most !== 1) return [false, worst.join("; ")];
  }
  return [true, `most animations on one piece, ${worst.join("; ")}`];
});

check("halls: each sphere bobs 8 to 12 pixels on its own 6 to 9 second loop, and its shadow keeps the same time, narrowing to 85% and fading a quarter at the top", async () => {
  const page = await open("/preview/backdrop?scene=halls-horizon", { height: 523 });
  await wait(ENTERED);
  const running = await animations(page);
  const floats = running.filter((animation) => animation.name === "bd-float");
  const shadows = running.filter((animation) => animation.name === "bd-shadow");
  const rises = (await atTheTop(page, "bd-float")).map((piece) => piece.rise);
  const tops = await atTheTop(page, "bd-shadow");
  await page.close();
  const periods = floats.map((animation) => animation.duration / 1000);
  const sameTime = floats.every((animation, index) => shadows[index]?.duration === animation.duration && shadows[index]?.delay === animation.delay);
  const top = tops.length === 3 && tops.every((shadow) => shadow.width === 0.85 && shadow.opacity === 0.75);
  const ok = floats.length === 3 && rises.every((rise) => rise >= 8 && rise <= 12) && periods.every((period) => period >= 6 && period <= 9) && new Set(periods).size === 3 && sameTime && top;
  return [ok, `rise ${rises.join(", ")} px, every ${periods.join(", ")} s; shadows at the top: ${tops[0]?.width} of their width, opacity ${tops[0]?.opacity}`];
});

check("halls: the ribbon drifts 6 pixels as one piece, and a highlight sweeps it once at the entrance and then every 24 seconds", async () => {
  const page = await open("/preview/backdrop?scene=halls-horizon", { height: 523 });
  await wait(500);
  const first = (await animations(page)).filter((animation) => animation.name === "bd-sweep").map((animation) => animation.duration / 1000);
  await wait(ENTERED);
  const running = await animations(page);
  const shapes = await page.$$eval(".bd-ribbon path", (paths) => paths.map((path) => path.getAttribute("d").length));
  const drift = (await atTheTop(page, "bd-drift")).map((piece) => piece.rise);
  await page.close();
  const drifts = running.filter((animation) => animation.name === "bd-drift");
  const sweeps = running.filter((animation) => animation.name === "bd-sweep").map((animation) => animation.duration / 1000);
  const together = new Set(drifts.map((animation) => `${animation.duration}/${animation.delay}/${Math.round(animation.time / 50)}`)).size === 1;
  const ok = drifts.length === 4 && together && drift.every((value) => value === 6) && drifts[0].duration === 12000 && first.join() === "3.2" && sweeps.join() === "24" && shapes.length === 5;
  return [ok, `${drifts.length} ribbon layers drift ${drift[0]} px every ${drifts[0]?.duration / 1000} s, in step: ${together}; a sweep of ${first.join()} s at the entrance, then one every ${sweeps.join()} s; ${shapes.length} ribbon paths, none animated`];
});

check("halls: on a device with a fine pointer, the spheres shift 4 to 8 pixels away from the pointer and the ribbon 2", async () => {
  const page = await open("/preview/backdrop?scene=halls-horizon", { height: 523 });
  await wait(300);
  const still = await moved(page, '[data-piece^="sphere-"]');
  // To the far left edge, middle height: everything shifts right.
  await page.mouse.move(700, 260);
  await page.mouse.move(0, 261, { steps: 12 });
  await wait(1500);
  const spheres = (await moved(page, '[data-piece^="sphere-"]')).map((sphere) => sphere.translate[0]);
  const shadows = (await moved(page, '[data-piece^="shadow-"]')).map((shadow) => shadow.translate[0]);
  const ribbon = (await moved(page, '[data-piece^="ribbon-"]')).map((piece) => piece.translate[0]);
  await page.close();
  const near = (value, goal) => Math.abs(value - goal) < 0.2;
  const ok = still.every((sphere) => sphere.translate[0] === 0) && near(spheres[0], 8) && near(spheres[1], 6) && near(spheres[2], 4) && shadows.every((value, index) => near(value, spheres[index])) && ribbon.length === 4 && ribbon.every((value) => near(value, 2));
  return [ok, `pointer at the left edge: spheres ${spheres.map((value) => value.toFixed(1)).join(", ")} px right, their shadows ${shadows.map((value) => value.toFixed(1)).join(", ")}, ribbon ${ribbon[0]?.toFixed(1)}`];
});

check("halls: on a touch device a finger moves nothing", async () => {
  const page = await open("/preview/backdrop?scene=halls-horizon", { height: 523, width: 1440, touch: true });
  const fine = await page.evaluate(() => window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  await page.touchscreen.touchStart(700, 260);
  await page.touchscreen.touchMove(40, 200);
  await page.touchscreen.touchEnd();
  await page.mouse.move(30, 100);
  await wait(1200);
  const shifts = (await moved(page, "[data-depth]")).map((piece) => piece.translate[0]);
  await page.close();
  return [!fine && shifts.length === 10 && shifts.every((value) => value === 0), `fine pointer: ${fine}; sideways shift of the ${shifts.length} pieces that follow: ${[...new Set(shifts)].join(", ")}`];
});

check("halls: as the page scrolls, the spheres lag it by 12%, 8% and 5%, and their shadows go with them", async () => {
  // A tall window, so the whole scene stays on screen while the page moves 200 pixels.
  const page = await open("/preview/backdrop?scene=halls-horizon&below=700", { height: 1400 });
  await wait(300);
  const read = async () => ({ spheres: (await moved(page, '[data-piece^="sphere-"]')).map((piece) => piece.translate[1]), shadows: (await moved(page, '[data-piece^="shadow-"]')).map((piece) => piece.translate[1]) });
  await page.evaluate(() => window.scrollTo(0, 100));
  await wait(300);
  const first = await read();
  await page.evaluate(() => window.scrollTo(0, 300));
  await wait(300);
  const second = await read();
  await page.close();
  const change = second.spheres.map((value, index) => value - first.spheres[index]);
  const near = (value, goal) => Math.abs(value - goal) < 0.3;
  const ok = near(change[0], 24) && near(change[1], 16) && near(change[2], 10) && second.shadows.every((value, index) => near(value, second.spheres[index]));
  return [ok, `the page moved 200 px; the spheres moved ${change.map((value) => value.toFixed(1)).join(", ")} px against it`];
});

check("about: two glows breathe, and the three ribbons are swept one at a time, 25 seconds apiece", async () => {
  const page = await open("/preview/backdrop?scene=about-ribbons", { height: 1346 });
  await wait(600);
  const running = await animations(page);
  await page.close();
  const glows = running.filter((animation) => animation.name === "bd-breathe");
  const turns = running.filter((animation) => animation.name === "bd-sweep-turn");
  const starts = turns.map((animation) => animation.delay / 1000);
  // Each sweeps for the first 8 seconds (32%) of its 25; the starts must be at least that far apart, around the loop.
  const gaps = starts.map((start, index) => ((starts[(index + 1) % starts.length] - start + 25) % 25));
  const ok = glows.length === 2 && turns.length === 3 && turns.every((animation) => animation.duration === 25000) && gaps.every((gap) => gap >= 8);
  return [ok, `${glows.length} glows; ${turns.length} sweeps starting ${starts.join(", ")} s in, ${gaps.map((gap) => gap.toFixed(2)).join(", ")} s apart, each lit for 8 s`];
});

check("on a phone the same scene is drawn smaller: the halls at 0.36 of the frame's size, so a 12-pixel bob is 4.3", async () => {
  const page = await open("/preview/home", { width: 380, height: 812 });
  await page.evaluate(() => document.querySelector('[data-name="backdrop/halls-horizon"]').scrollIntoView({ block: "center" }));
  await wait(ENTERED + 400);
  const width = await page.$eval('[data-name="backdrop/halls-horizon"] .bd-stage', (stage) => stage.getBoundingClientRect().width);
  const rises = (await atTheTop(page, "bd-float")).map((piece) => piece.rise);
  await page.close();
  const rise = rises[0] ?? 0;
  return [Math.abs(width - 518.4) < 0.1 && Math.abs(rise - 4.32) < 0.05, `stage ${width.toFixed(1)} px wide (1440 x 0.36), first sphere rises ${rise.toFixed(2)} px`];
});

let passed = 0;
let ran = 0;
for (const { name, run } of checks) {
  ran++;
  try {
    const outcome = await run();
    const [ok, note] = Array.isArray(outcome) ? outcome : [outcome, ""];
    if (ok) passed++;
    console.log(`${ok ? "pass" : "FAIL"}  ${name}${note ? `\n        ${note}` : ""}`);
  } catch (error) {
    console.log(`FAIL  ${name}: ${error.message.split("\n")[0]}`);
  }
}
await browser.close();
console.log(ran === checks.length ? `\n${passed}/${checks.length} passed` : `\n${passed}/${checks.length}, run incomplete`);
process.exit(passed === checks.length ? 0 : 1);
