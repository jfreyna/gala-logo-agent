#!/usr/bin/env node
/**
 * The visual gate: puts each built screen beside its Figma frame.
 *
 * For every screen in the list it opens the dev preview at the frame's size
 * and color mode, takes a screenshot, and writes one image with the frame on
 * the left and the build on the right. It also prints how many pixels differ
 * by more than a small tolerance.
 *
 * What it proves: layout, color, type and copy line up with the frame at the
 * two drawn sizes, in the drawn mode.
 * What it does not prove: behavior, any size between the two drawn ones, or
 * that a difference is acceptable. The percentage is a pointer to where to
 * look, not a grade: fonts render a little differently in Figma and in a
 * browser, so a matching screen still shows a few percent.
 *
 * Usage:
 *   node scripts/visual-gate.mjs <folder of frame PNGs> <output folder> [name filter]
 * The frame PNGs are named <screen>-<size>-<mode>.png and exported from Figma
 * at the frame's own size. The dev server must be running on port 3000.
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const [framesDir, outDir, filter] = process.argv.slice(2);
if (!framesDir || !outDir) {
  console.error("Usage: node scripts/visual-gate.mjs <frames folder> <output folder> [name filter]");
  process.exit(2);
}

const BASE = process.env.GALA_PREVIEW_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const DESKTOP = { w: 1440, h: 900 };
const MOBILE = { w: 380, h: 812 };

/** screen name, preview path, and the desktop frame height where it isn't 900 */
const STUDIO = [
  ["studio", "/preview/studio?working=1"],
  ["brief", "/preview/brief?bottom=1"],
  ["research", "/preview/research"],
  ["upload", "/preview/upload"],
  ["type", "/preview/type?panel=type&top=1", { plain: "/preview/type", mobile: "/preview/type?skip=1&top=1" }],
  ["directions", "/preview/directions", { h: 1000, mobile: "/preview/directions?skip=1&top=1" }],
  ["variations", "/preview/variations"],
  ["stresstest", "/preview/stress", { mobile: "/preview/stress?skip=1" }],
  ["pickcolors", "/preview/pickColors?bottom=1"],
  ["color", "/preview/color?panel=color", { plain: "/preview/color" }],
  ["kit", "/preview/kit?panel=kit", { plain: "/preview/kit", mobile: "/preview/kit?top=1" }],
  ["picks", "/preview/picks"],
  ["panel", "/preview/directions?panel=history&top=1", { dark: "/preview/directions?panel=artifact&top=1" }],
  ["memory", "/preview/directions?panel=memory&top=1"],
];

const screens = [
  { name: "intro-desktop-light", path: "/preview/home?pin=1", ...DESKTOP, scheme: "light", full: true },
  { name: "intro-desktop-dark", path: "/preview/home?pin=1", ...DESKTOP, scheme: "dark", full: true },
  { name: "intro-mobile-light", path: "/preview/home", ...MOBILE, scheme: "light", full: true },
  { name: "intro-mobile-dark", path: "/preview/home", ...MOBILE, scheme: "dark", full: true },
  { name: "about-desktop-light", path: "/about", ...DESKTOP, scheme: "light", full: true },
  { name: "about-desktop-dark", path: "/about", ...DESKTOP, scheme: "dark", full: true },
  { name: "about-mobile-light", path: "/about", ...MOBILE, scheme: "light", full: true },
  { name: "about-mobile-dark", path: "/about", ...MOBILE, scheme: "dark", full: true },
  { name: "hallmodal-desktop-light", path: "/preview/home?pin=1&modal=fame", ...DESKTOP, scheme: "light", scrollTo: 760 },
  { name: "hallmodal-desktop-dark", path: "/preview/home?pin=1&modal=fame", ...DESKTOP, scheme: "dark", scrollTo: 760 },
  { name: "hallmodal-mobile-light", path: "/preview/home?modal=fame", ...MOBILE, scheme: "light", scrollTo: 380 },
  { name: "accountmenu-desktop-light", path: "/preview/studio?menu=1", ...DESKTOP, scheme: "light" },
  { name: "accountmenu-mobile-light", path: "/preview/studio?menu=1", ...MOBILE, scheme: "light" },
  { name: "hints-desktop-light", path: "/preview/studio?hints=1", ...DESKTOP, scheme: "light" },
  { name: "hints-mobile-light", path: "/preview/studio?hints=1", ...MOBILE, scheme: "light" },
  { name: "projects-desktop-light", path: "/preview/projects", w: 1440, h: 858, scheme: "light" },
  { name: "projects-desktop-dark", path: "/preview/projects", w: 1440, h: 858, scheme: "dark" },
  { name: "projects-mobile-light", path: "/preview/projects", ...MOBILE, scheme: "light", full: true },
  // The join card's three sign-in states, drawn in Figma as component variants: the card alone, 340 wide on desktop and 348 on a phone.
  ...[
    ["signin", "signIn", 450],
    ["signingin", "signingIn", 450],
    ["signinerror", "signInError", 479],
  ].flatMap(([name, state, h]) =>
    [
      ["desktop", 340],
      ["mobile", 348],
    ].flatMap(([size, w]) => ["light", "dark"].map((scheme) => ({ name: `${name}-${size}-${scheme}`, path: `/preview/joincard?state=${state}`, w, h, scheme }))),
  ),
  ...STUDIO.flatMap(([name, path, options = {}]) => [
    { name: `${name}-desktop-light`, path, w: 1440, h: options.h ?? 900, scheme: "light" },
    // The frames draw the panel beside these screens in desktop light only.
    { name: `${name}-desktop-dark`, path: options.dark ?? options.plain ?? path, w: 1440, h: options.h ?? 900, scheme: "dark" },
    // The mobile frames leave out the visitor's first message where the artifact fills the screen.
    { name: `${name}-mobile-light`, path: options.mobile ?? options.plain ?? path, ...MOBILE, scheme: "light" },
  ]),
].filter((screen) => !filter || screen.name.includes(filter));

const exists = (path) => access(path).then(() => true, () => false);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars", "--force-device-scale-factor=1"] });
await mkdir(outDir, { recursive: true });
await mkdir(join(outDir, "built"), { recursive: true });

let compared = 0;
const missing = [];
const lines = [];

for (const screen of screens) {
  const framePath = join(framesDir, `${screen.name}.png`);
  if (!(await exists(framePath))) {
    missing.push(screen.name);
    continue;
  }
  const page = await browser.newPage();
  await page.setViewport({ width: screen.w, height: screen.h, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: screen.scheme },
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.goto(BASE + screen.path, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);
  if (screen.scrollTo) await page.evaluate((y) => window.scrollTo(0, y), screen.scrollTo);
  await new Promise((resolve) => setTimeout(resolve, 600));
  const builtPath = join(outDir, "built", `${screen.name}.png`);
  await page.screenshot({ path: builtPath, fullPage: Boolean(screen.full) });
  await page.close();

  // Compose the pair and count differing pixels, in a page of our own.
  const frame = (await readFile(framePath)).toString("base64");
  const built = (await readFile(builtPath)).toString("base64");
  const sheet = await browser.newPage();
  await sheet.setViewport({ width: screen.w * 2 + 48, height: 900, deviceScaleFactor: 1 });
  await sheet.setContent(`<!doctype html><html><body style="margin:0;background:#1b1b1b;font:13px/1.4 -apple-system,sans-serif;color:#eee">
    <div style="display:inline-flex;gap:16px;padding:16px;align-items:flex-start">
      <figure style="margin:0"><figcaption style="padding:0 0 8px">Figma frame: ${screen.name}</figcaption><img id="a" src="data:image/png;base64,${frame}"></figure>
      <figure style="margin:0"><figcaption style="padding:0 0 8px">Built screen</figcaption><img id="b" src="data:image/png;base64,${built}"></figure>
    </div></body></html>`);
  const result = await sheet.evaluate(async () => {
    const [a, b] = [document.getElementById("a"), document.getElementById("b")];
    await Promise.all([a.decode(), b.decode()]);
    const width = Math.min(a.naturalWidth, b.naturalWidth);
    const height = Math.min(a.naturalHeight, b.naturalHeight);
    const pixels = (image) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, width, height).data;
    };
    const [pa, pb] = [pixels(a), pixels(b)];
    let differing = 0;
    for (let i = 0; i < pa.length; i += 4) {
      if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 48) differing++;
    }
    return { frame: [a.naturalWidth, a.naturalHeight], built: [b.naturalWidth, b.naturalHeight], percent: (differing / (width * height)) * 100 };
  });
  const body = await sheet.$("body > div");
  await writeFile(join(outDir, `${screen.name}.webp`), await body.screenshot({ type: "webp", quality: 80 }));
  if (process.env.GALA_GATE_REVIEW) {
    // A small copy of the pair for a quick look: both images at reduced width.
    const each = Number(process.env.GALA_GATE_REVIEW);
    await sheet.addStyleTag({ content: `img{width:${each}px;height:auto}` });
    await mkdir(join(outDir, "review"), { recursive: true });
    await writeFile(join(outDir, "review", `${screen.name}.png`), await (await sheet.$("body > div")).screenshot());
  }
  await sheet.close();
  compared++;
  lines.push(`${screen.name.padEnd(30)} frame ${result.frame.join("x").padEnd(10)} built ${result.built.join("x").padEnd(10)} differing ${result.percent.toFixed(2)}%`);
}

await browser.close();
console.log(lines.join("\n"));
if (missing.length > 0) console.log(`\nNo frame PNG for: ${missing.join(", ")}`);
const expected = screens.length;
console.log(compared === expected ? `\n${compared}/${expected} screens compared` : `\n${compared}/${expected}, run incomplete`);
