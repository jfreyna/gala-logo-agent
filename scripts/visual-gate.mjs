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
 * at the frame's own size. A screen with `element` is a component variant,
 * compared as that element alone. The dev server must be running on port 3000.
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
  ["wordmark", "/preview/wordmark?top=1", { h: 1040, mobile: "/preview/wordmark?skip=1&top=1" }],
  ["lockup", "/preview/lockup?top=1", { h: 1040, mobile: "/preview/lockup?skip=1&top=1" }],
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
  // Drawn in desktop light only: a request held for a later step, and Gala opening the symbol step.
  { name: "held-desktop-light", path: "/preview/held?top=1", w: 1440, h: 1240, scheme: "light" },
  { name: "opener-desktop-light", path: "/preview/opener?top=1", ...DESKTOP, scheme: "light" },
  // Feedback loops (FRI-1712), drawn in desktop light: a card action heard at once, then done; past cards read-only.
  { name: "fb-heard-desktop-light", path: "/preview/heard?top=1", w: 1440, h: 948, scheme: "light" },
  { name: "fb-heardworking-desktop-light", path: "/preview/heardWorking?top=1", w: 1440, h: 995, scheme: "light" },
  { name: "fb-history-desktop-light", path: "/preview/history", w: 1440, h: 1040, scheme: "light" },
  // Failures answered (FRI-1714). Couldn't draw is also drawn in desktop dark and on a phone.
  // Button states and small feedback (FRI-1715), drawn in desktop light.
  { name: "fb-handedoff-desktop-light", path: "/preview/handedOff?top=1&handedOff=1", w: 1440, h: 900, scheme: "light" },
  { name: "fb-stopped-desktop-light", path: "/preview/stopped?top=1", w: 1440, h: 900, scheme: "light" },
  // Stopped with retry (FRI-1729), drawn as gala-notice variants: the notice alone, 768 wide on desktop and 348 on a phone.
  ...["desktop", "mobile"].flatMap((size) =>
    ["light", "dark"].map((scheme) => ({ name: `stoppedretry-${size}-${scheme}`, path: "/preview/stoppedRetry?top=1", ...(size === "desktop" ? DESKTOP : MOBILE), scheme, element: '[data-name="gala-notice"]' })),
  ),
  { name: "fb-downloads-desktop-light", path: "/preview/kit?top=1&downloads=SVG:saved,EPS:saving,PNG:couldnt", w: 1440, h: 900, scheme: "light" },
  { name: "fb-backwhileworking-desktop-light", path: "/preview/backWhileWorking?top=1&panel=historyWorking", w: 1440, h: 900, scheme: "light" },
  { name: "fb-couldntdraw-desktop-light", path: "/preview/couldntDraw?top=1", w: 1440, h: 900, scheme: "light" },
  { name: "fb-couldntdraw-desktop-dark", path: "/preview/couldntDraw?top=1", w: 1440, h: 900, scheme: "dark" },
  { name: "fb-couldntdraw-mobile-light", path: "/preview/couldntDraw?top=1", w: 380, h: 812, scheme: "light" },
  { name: "fb-repeated-desktop-light", path: "/preview/repeated?top=1", w: 1440, h: 900, scheme: "light" },
  { name: "fb-couldntstart-desktop-light", path: "/preview/couldntStart?top=1", w: 1440, h: 900, scheme: "light" },
  {
    name: "fb-sendfailed-desktop-light",
    path: `/preview/sendFailed?top=1&attached=1&file=storefront.jpg&typing=${encodeURIComponent("Here’s our storefront, and the street it’s on")}&sendError=${encodeURIComponent("That file is too large. The limit is 10 MB. Your words are still here; attach a smaller file or send without it.")}`,
    w: 1440,
    h: 900,
    scheme: "light",
  },
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
  // A component variant is compared as the element alone, at its own size in the page.
  if (screen.element) await (await page.$(screen.element)).screenshot({ path: builtPath });
  else await page.screenshot({ path: builtPath, fullPage: Boolean(screen.full) });
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
  const result = await sheet.evaluate(async (element) => {
    const [a, b] = [document.getElementById("a"), document.getElementById("b")];
    await Promise.all([a.decode(), b.decode()]);
    if (element) {
      // A dark component variant is exported on its component set's light canvas (#f5f5f5): that canvas color is
      // replaced by the page's own background, read from the built element's top-right pixel. Antialiased edges
      // blended with the canvas stay as they are, so they show as a thin fringe in the count.
      const probe = document.createElement("canvas");
      probe.width = b.naturalWidth;
      probe.height = b.naturalHeight;
      const probeContext = probe.getContext("2d");
      probeContext.drawImage(b, 0, 0);
      const [r, g, bl] = probeContext.getImageData(b.naturalWidth - 1, 0, 1, 1).data;
      const flat = document.createElement("canvas");
      flat.width = a.naturalWidth;
      flat.height = a.naturalHeight;
      const flatContext = flat.getContext("2d");
      flatContext.fillStyle = `rgb(${r}, ${g}, ${bl})`;
      flatContext.fillRect(0, 0, flat.width, flat.height);
      flatContext.drawImage(a, 0, 0);
      const image = flatContext.getImageData(0, 0, flat.width, flat.height);
      for (let i = 0; i < image.data.length; i += 4) {
        if (image.data[i] === 245 && image.data[i + 1] === 245 && image.data[i + 2] === 245) [image.data[i], image.data[i + 1], image.data[i + 2]] = [r, g, bl];
      }
      flatContext.putImageData(image, 0, 0);
      a.src = flat.toDataURL("image/png");
      await a.decode();
    }
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
  }, Boolean(screen.element));
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
