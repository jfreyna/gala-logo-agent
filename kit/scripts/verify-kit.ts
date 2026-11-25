/**
 * verify-kit: an end-to-end fixture run of buildKit, then a check of every
 * file it returns.
 *
 * Fixture: fixtures/spike_mark.png (the Gala spike mark, JPEG bytes under a
 * .png name on purpose), "Ember & Rye", Young Serif, and the draft colors
 * from the `gala-palette` frame. Needs network access to Google Fonts, and
 * Ghostscript (`gs`) for the EPS read-back; without `gs` the EPS checks are
 * reported as not run and the run is incomplete.
 *
 * Reach (gate 3b):
 * - "SVG parses and is outlined" means well-formed XML whose only elements are
 *   svg, title and path. It does not judge how the type looks.
 * - "EPS opens" means Ghostscript interprets it without error, its painted
 *   bounding box sits inside the declared one, and its render matches the
 *   SVG's render with an ink overlap of 98% or more. The all-white EPS is read
 *   through an inverting transfer function (bbox) and rendered on a black
 *   page, then compared with the black SVG,
 *   so its geometry is proven; every EPS fill is also checked in the file text.
 * - The trace is checked for path count, bounds and fill, not likeness to the
 *   source mark; likeness is for the founder's eye (screenshots in the PR).
 */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import pngjs from "pngjs";
import resvg from "@resvg/resvg-js";
import { buildKit, type KitFile, type KitInput, type KitResult } from "../src/index.ts";
import { contrast, ladder } from "../src/color.ts";
import { loadFont, setText, type FetchLike } from "../src/font.ts";
import { inkBox, LOCKUP_RATIOS, primaryLockup, stackedLockup } from "../src/layout.ts";
import { bounds, parsePath, subpathCount } from "../src/path.ts";
import { traceMark } from "../src/trace.ts";
import { assert, assertClose, assertEqual, createHarness, NotRun } from "./harness.ts";

const { PNG } = pngjs;
const { Resvg } = resvg;

const here = dirname(fileURLToPath(import.meta.url));
const fixtureBytes = new Uint8Array(readFileSync(join(here, "../fixtures/spike_mark.png")));

const INPUT: KitInput = {
  mark: { bytes: fixtureBytes, mime: "image/png" },
  name: "Ember & Rye",
  fontFamily: "Young Serif",
  colors: { primary: "#B83A1B", secondary: "#E3B65C", tertiary: "#2B2622" },
  colorway: { mark: "primary", wordmark: "tertiary" },
};

const LOCKUPS = ["primary", "stacked", "icon", "wordmark"] as const;
const VARIANTS = ["color", "black", "white"] as const;
const FORMATS = ["svg", "eps", "png"] as const;
const SLUG = "ember-and-rye";
const EXPECTED_PATHS = [
  ...LOCKUPS.flatMap((l) => VARIANTS.flatMap((v) => FORMATS.map((f) => `${f}/${SLUG}-${l}-${v}.${f}`))),
  `square/${SLUG}-square.png`,
  `social/${SLUG}-social.png`,
];
const PATHS_PER_LOCKUP: Record<string, number> = { primary: 2, stacked: 2, icon: 1, wordmark: 1 };
const FILLS: Record<string, { mark: string; wordmark: string }> = {
  color: { mark: "#B83A1B", wordmark: "#2B2622" },
  black: { mark: "#000000", wordmark: "#000000" },
  white: { mark: "#FFFFFF", wordmark: "#FFFFFF" },
};
// The fixture traces to its outline plus the inner flame.
const FIXTURE_SUBPATHS = 2;

const h = createHarness("verify-kit");
let kit: KitResult | undefined;
let fixtureSubpaths = 0;
const byPath = (p: string): KitFile => {
  if (!kit) throw new Error("buildKit did not finish");
  const f = kit.files.find((x) => x.path === p);
  if (!f) throw new Error(`missing ${p}`);
  return f;
};

const hasGs = (() => {
  try {
    execFileSync("gs", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
})();
const work = mkdtempSync(join(tmpdir(), "gala-kit-verify-"));

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  assert(sig.every((b, i) => bytes[i] === b), "not a PNG signature");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * Ink mask. Dark ink on white: any pixel visibly darker than white once
 * composited on white. Light ink (`light`, the all-white EPS on a black
 * page): any pixel visibly lighter than black.
 */
function inkMask(png: { width: number; height: number; data: Uint8Array }, light = false): Uint8Array {
  const mask = new Uint8Array(png.width * png.height);
  for (let i = 0; i < mask.length; i++) {
    const a = png.data[i * 4 + 3]! / 255;
    const lum = (0.2126 * png.data[i * 4]! + 0.7152 * png.data[i * 4 + 1]! + 0.0722 * png.data[i * 4 + 2]!) * a + 255 * (1 - a);
    mask[i] = light ? (lum > 5 ? 1 : 0) : lum < 250 ? 1 : 0;
  }
  return mask;
}

// ---- the run itself -------------------------------------------------------

h.check("buildKit runs on the fixture mark", async () => {
  const t0 = Date.now();
  kit = await buildKit(INPUT);
  console.log(`        (${kit.files.length} files in ${Date.now() - t0} ms)`);
  if (process.env.KIT_OUT) {
    for (const f of kit.files) {
      const dest = join(process.env.KIT_OUT, f.path);
      execFileSync("mkdir", ["-p", dirname(dest)]);
      writeFileSync(dest, f.bytes);
    }
    writeFileSync(join(process.env.KIT_OUT, "spec.json"), JSON.stringify(kit.spec, null, 2));
  }
});

h.check(`the fixture traces to ${FIXTURE_SUBPATHS} subpaths inside the source image`, async () => {
  const traced = await traceMark(fixtureBytes);
  fixtureSubpaths = traced.subpaths;
  assertEqual(traced.subpaths, FIXTURE_SUBPATHS, "subpaths");
  assertEqual(traced.source.format, "jpeg", "sniffed format");
  const b = bounds(traced.segments);
  assert(b.x >= 0 && b.y >= 0 && b.x + b.width <= traced.source.width && b.y + b.height <= traced.source.height, `bounds ${JSON.stringify(b)} leave the image`);
  assert(b.width > 100 && b.height > 100, "the traced mark is implausibly small");
});

h.check(`exactly ${EXPECTED_PATHS.length} files, one per expected path`, () => {
  assert(kit, "no kit");
  assertEqual(kit.files.map((f) => f.path).sort(), [...EXPECTED_PATHS].sort(), "paths");
});

// ---- SVG -------------------------------------------------------------------

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", isArray: (name) => name === "path" });
for (const lockup of LOCKUPS) {
  for (const variant of VARIANTS) {
    const p = `svg/${SLUG}-${lockup}-${variant}.svg`;
    h.check(`${p}: parses, outlined only, ${PATHS_PER_LOCKUP[lockup]} path(s), right fills, ink fills its viewBox`, () => {
      const f = byPath(p);
      const text = new TextDecoder().decode(f.bytes);
      assert(XMLValidator.validate(text) === true, "not well-formed XML");
      const elements = [...text.matchAll(/<([a-zA-Z][\w:-]*)/g)].map((m) => m[1]);
      const unexpected = elements.filter((e) => !["svg", "title", "path"].includes(e!));
      assert(unexpected.length === 0, `unexpected elements: ${unexpected.join(", ")}`);
      assert(!/font|@import|url\(|href=/i.test(text.replace(/<title>[^<]*<\/title>/, "")), "font or external reference present");
      const doc = parser.parse(text).svg;
      const paths: { fill: string; d: string; "fill-rule"?: string }[] = doc.path;
      assertEqual(paths.length, PATHS_PER_LOCKUP[lockup], "path count");
      const fills = FILLS[variant]!;
      const expectFills = lockup === "wordmark" ? [fills.wordmark] : lockup === "icon" ? [fills.mark] : [fills.mark, fills.wordmark];
      assertEqual(paths.map((x) => x.fill), expectFills, "fills");
      if (lockup !== "wordmark") assertEqual(subpathCount(parsePath(paths[0]!.d)), fixtureSubpaths || FIXTURE_SUBPATHS, "mark subpaths");
      const [, , vw, vh] = String(doc.viewBox).split(" ").map(Number) as [number, number, number, number];
      const ink = paths.map((x) => bounds(parsePath(x.d)));
      const tol = Math.max(vw, vh) * 0.002;
      for (const b of ink) assert(b.x >= -tol && b.y >= -tol && b.x + b.width <= vw + tol && b.y + b.height <= vh + tol, `ink ${JSON.stringify(b)} leaves viewBox ${vw}x${vh}`);
      const minX = Math.min(...ink.map((b) => b.x));
      const maxX = Math.max(...ink.map((b) => b.x + b.width));
      const minY = Math.min(...ink.map((b) => b.y));
      const maxY = Math.max(...ink.map((b) => b.y + b.height));
      assert(minX < tol && minY < tol && vw - maxX < tol && vh - maxY < tol, "artwork is not cropped to its ink");
      assertClose(Math.max(f.width, f.height), 512, 0.01, "natural long edge");
    });
  }
}

// ---- EPS -------------------------------------------------------------------

for (const lockup of LOCKUPS) {
  for (const variant of VARIANTS) {
    const p = `eps/${SLUG}-${lockup}-${variant}.eps`;
    // White paint is invisible to Ghostscript on white paper. For the all-white
    // EPS the bbox device reads the file through an inverting transfer
    // function, and the render paints a black page first; the file itself is
    // unchanged.
    const white = variant === "white";
    const invert = white ? ["-c", "{1 exch sub} settransfer", "-f"] : [];
    const blackPage = white ? ["-c", "<< /BeginPage { 0 setgray clippath fill } >> setpagedevice", "-f"] : [];
    h.check(`${p}: Ghostscript opens it, painted bbox inside the declared one, render matches the SVG${variant === "white" ? " (read on black)" : ""}`, () => {
      if (!hasGs) throw new NotRun("Ghostscript (gs) is not installed");
      const f = byPath(p);
      const text = new TextDecoder().decode(f.bytes);
      assert(text.startsWith("%!PS-Adobe-3.0 EPSF-3.0\n"), "missing EPSF header");
      const declared = text.match(/%%BoundingBox: 0 0 (\d+) (\d+)/);
      assert(declared, "no %%BoundingBox");
      const fills = FILLS[variant]!;
      const expectHex = lockup === "wordmark" ? [fills.wordmark] : lockup === "icon" ? [fills.mark] : [fills.mark, fills.wordmark];
      const toPs = (hex: string) => [1, 3, 5].map((i) => String(Math.round((parseInt(hex.slice(i, i + 2), 16) / 255) * 10000) / 10000)).join(" ");
      assertEqual([...text.matchAll(/^(.*) setrgbcolor$/gm)].map((m) => m[1]), expectHex.map(toPs), "EPS fills");
      const file = join(work, p.replace(/\//g, "_"));
      writeFileSync(file, f.bytes);
      // The bbox device prints its result on stderr; a PostScript error exits non-zero and throws here.
      const bbox = spawnSync("gs", ["-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=bbox", ...invert, file], { encoding: "utf8" });
      assert(bbox.status === 0, `Ghostscript failed: ${bbox.stderr.slice(0, 300)}`);
      const painted = bbox.stderr.match(/%%HiResBoundingBox: ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/);
      assert(painted, `Ghostscript reported no bounding box: ${bbox.stderr.slice(0, 200)}`);
      const [x0, y0, x1, y1] = painted.slice(1).map(Number) as [number, number, number, number];
      const W = Number(declared[1]);
      const H = Number(declared[2]);
      assert(x0 >= -1 && y0 >= -1 && x1 <= W + 1 && y1 <= H + 1, `painted ${x0} ${y0} ${x1} ${y1} outside 0 0 ${W} ${H}`);
      assert(x1 - x0 > W * 0.9 && y1 - y0 > H * 0.9, `painted area ${x1 - x0}x${y1 - y0} is much smaller than ${W}x${H}`);
      // Render the EPS at 1024 px on the long edge and compare with the SVG rendered the same way.
      const long = 1024;
      const dpi = (72 * long) / Math.max(f.width, f.height);
      const out = `${file}.png`;
      const render = spawnSync("gs", ["-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dEPSCrop", "-sDEVICE=png16m", `-r${dpi.toFixed(4)}`, "-dGraphicsAlphaBits=4", `-sOutputFile=${out}`, ...blackPage, file], { encoding: "utf8" });
      assert(render.status === 0, `Ghostscript render failed: ${render.stderr.slice(0, 300)}`);
      const epsPng = PNG.sync.read(readFileSync(out));
      const svgVariant = variant === "white" ? "black" : variant;
      const svgFile = byPath(`svg/${SLUG}-${lockup}-${svgVariant}.svg`);
      const svgPng = PNG.sync.read(new Resvg(Buffer.from(svgFile.bytes), { fitTo: { mode: "width", value: epsPng.width }, background: "white" }).render().asPng());
      assert(Math.abs(svgPng.height - epsPng.height) <= 2, `render heights differ: eps ${epsPng.height}, svg ${svgPng.height}`);
      const a = inkMask({ ...epsPng, data: new Uint8Array(epsPng.data) }, white);
      const b = inkMask({ ...svgPng, data: new Uint8Array(svgPng.data) });
      let inter = 0;
      let union = 0;
      for (let y = 0; y < Math.min(epsPng.height, svgPng.height); y++) {
        for (let x = 0; x < Math.min(epsPng.width, svgPng.width); x++) {
          const ia = a[y * epsPng.width + x]!;
          const ib = b[y * svgPng.width + x]!;
          inter += ia & ib;
          union += ia | ib;
        }
      }
      const iou = inter / union;
      assert(iou >= 0.98, `EPS and SVG renders overlap only ${(iou * 100).toFixed(2)}%`);
    });
  }
}

// ---- PNG -------------------------------------------------------------------

for (const lockup of LOCKUPS) {
  for (const variant of VARIANTS) {
    const p = `png/${SLUG}-${lockup}-${variant}.png`;
    h.check(`${p}: 2048 px on the long edge, the SVG's aspect, transparent ground, ink present`, () => {
      const f = byPath(p);
      const size = pngSize(f.bytes);
      assertEqual(size, { width: f.width, height: f.height }, "declared size");
      assertEqual(Math.max(size.width, size.height), 2048, "long edge");
      const svg = byPath(p.replace(/^png\//, "svg/").replace(/\.png$/, ".svg"));
      assertClose(size.width / size.height, svg.width / svg.height, 0.01, "aspect");
      const png = PNG.sync.read(Buffer.from(f.bytes));
      assertEqual(png.data[3], 0, "top-left pixel is not transparent");
      let inked = 0;
      for (let i = 3; i < png.data.length; i += 4) if (png.data[i]! > 128) inked++;
      assert(inked > size.width * size.height * 0.05, `only ${inked} opaque pixels`);
    });
  }
}

for (const [lockup, w, hgt] of [["square", 1024, 1024], ["social", 1200, 630]] as const) {
  const p = `${lockup}/${SLUG}-${lockup}.png`;
  h.check(`${p}: ${w}x${hgt}, the neutral #F5F5F5 ground in the corner, the mark in primary`, () => {
    const f = byPath(p);
    assertEqual(pngSize(f.bytes), { width: w, height: hgt }, "size");
    const png = PNG.sync.read(Buffer.from(f.bytes));
    assertEqual([...png.data.subarray(0, 4)], [0xf5, 0xf5, 0xf5, 255], "corner is not the opaque neutral ground");
    let primary = 0;
    for (let i = 0; i < png.data.length; i += 4) if (png.data[i] === 0xb8 && png.data[i + 1] === 0x3a && png.data[i + 2] === 0x1b) primary++;
    assert(primary > w * hgt * 0.01, `only ${primary} primary-colored pixels`);
  });
}

// ---- spec sheet -------------------------------------------------------------

h.check("spec: three colors with hex, RGB, CMYK, ten-step ladders and the CMYK note", () => {
  assert(kit, "no kit");
  const s = kit.spec;
  assertEqual(s.colors.map((c) => c.role), ["primary", "secondary", "tertiary"], "roles");
  assertEqual(s.colors[0]!.rgb, [184, 58, 27], "primary rgb");
  assertEqual(s.colors[0]!.cmyk, [0, 68, 85, 28], "primary cmyk");
  for (const c of s.colors) assertEqual(c.ladder.map((e) => e.hex), ladder(c.hex).map((e) => e.hex), `${c.role} ladder`);
  assertEqual(s.cmykNote, "CMYK values are a straight conversion, for reference. Confirm them with your printer before a print run.", "note");
});

h.check("spec: every contrast number recomputes to the same value", () => {
  assert(kit, "no kit");
  for (const c of kit.spec.colors) {
    assertEqual(c.contrast.onWhite, contrast(c.hex, "#FFFFFF"), `${c.role} on white`);
    assertEqual(c.contrast.onBlack, contrast(c.hex, "#000000"), `${c.role} on black`);
  }
  assertEqual(kit.spec.pairs.map((p) => `${p.foreground}/${p.background}`), ["primary/white", "tertiary/white", "primary/neutral", "tertiary/neutral"], "pairs");
  assertEqual(kit.spec.pairs[0]!.contrast.label, "5.7:1", "primary on white label");
});

h.check("spec: clear space, minimum sizes and type as the Kit view shows them", () => {
  assert(kit, "no kit");
  const s = kit.spec;
  assertEqual(s.clearSpace, { basis: "markHeight", ratio: 0.45 }, "clear space");
  assertEqual(s.minimumSizes.map((m) => `${m.label} ${m.px}`), ["Icon 16", "Primary lock-up 120", "Wordmark 80"], "minimum sizes");
  assertEqual([s.type.family, s.type.weight, s.type.license, s.type.category], ["Young Serif", 400, "OFL", "Serif"], "type");
});

// ---- other inputs -----------------------------------------------------------

// ---- lock-up spacing --------------------------------------------------------
//
// The stacked lock-up places the name by its cap height. Some typefaces draw
// letters taller than the cap height they state (Rye is one), and before the
// guard in `stackedLockup` the name then ran into the mark. These checks
// measure the outlined glyphs themselves, not the font's metrics.
//
// What they do not prove: other typefaces, or names with accents above the
// capitals, beyond the two families here. The guard measures the real ink, so
// it holds for any outline, but only these two are asserted.

/** The clear distance between the mark's ink and the name's ink, as a share of the mark's box. */
async function spacing(family: string, lockup: "stacked" | "primary"): Promise<number> {
  const [mark, font] = await Promise.all([traceMark(fixtureBytes), loadFont(family, 400, fetch as unknown as FetchLike)]);
  const art = (lockup === "stacked" ? stackedLockup : primaryLockup)(mark, (fontSize) => setText(font, INPUT.name, fontSize));
  const markInk = inkBox(art, "mark");
  const nameInk = inkBox(art, "wordmark");
  const box = Math.max(markInk.width, markInk.height);
  return lockup === "stacked" ? (nameInk.y - (markInk.y + markInk.height)) / box : (nameInk.x - (markInk.x + markInk.width)) / box;
}

for (const [family, why] of [
  ["Rye", "its letters rise above its stated cap height"],
  ["Young Serif", "an ordinary serif, as a control"],
] as const) {
  h.check(`stacked lock-up in ${family} (${why}): the name's ink is at least the stated gap below the mark's ink`, async () => {
    const gap = await spacing(family, "stacked");
    assert(gap >= LOCKUP_RATIOS.stacked.gap - 1e-6, `gap is ${gap.toFixed(4)} of the mark's box; the stated gap is ${LOCKUP_RATIOS.stacked.gap.toFixed(4)}`);
  });
}

h.check("primary lock-up in Rye: the name's ink starts exactly the stated gap to the right of the mark's ink", async () => {
  assertClose(await spacing("Rye", "primary"), LOCKUP_RATIOS.primary.gap, 1e-6, "gap, as a share of the mark's box");
});

h.check("an SVG mark is rasterized and traced to the same subpath count", async () => {
  const svg = byPath(`svg/${SLUG}-icon-black.svg`);
  const traced = await traceMark(svg.bytes);
  assertEqual([traced.source.format, traced.subpaths], ["svg", FIXTURE_SUBPATHS], "format and subpaths");
});

h.check("a white-on-black mark is flipped and traces the same", async () => {
  const icon = byPath(`svg/${SLUG}-icon-white.svg`);
  const text = new TextDecoder().decode(icon.bytes).replace(/(<svg[^>]*>)/, (m) => {
    const vb = m.match(/viewBox="([^"]+)"/)![1]!.split(" ").map(Number);
    const pad = vb[2]! * 0.2;
    // Drop width/height so the padded viewBox keeps its own aspect (no letterbox bars).
    return m.replace(/ width="[^"]+" height="[^"]+"/, "").replace(/viewBox="[^"]+"/, `viewBox="${-pad} ${-pad} ${vb[2]! + 2 * pad} ${vb[3]! + 2 * pad}"`) + `<path fill="#000000" d="M${-pad} ${-pad}h${vb[2]! + 2 * pad}v${vb[3]! + 2 * pad}h${-(vb[2]! + 2 * pad)}Z"/>`;
  });
  const png = new Resvg(text, { fitTo: { mode: "width", value: 800 } }).render().asPng();
  const traced = await traceMark(new Uint8Array(png));
  assertEqual([traced.source.inverted, traced.subpaths], [true, FIXTURE_SUBPATHS], "inverted and subpaths");
});

h.check("bad inputs fail loudly: empty mark, bad hex, unknown family, colorway role not given", async () => {
  const blank = new PNG({ width: 200, height: 200 });
  blank.data.fill(255);
  const cases: [string, KitInput, RegExp][] = [
    ["empty mark", { ...INPUT, mark: { bytes: new Uint8Array(PNG.sync.write(blank)), mime: "image/png" } }, /empty after thresholding/],
    ["bad hex", { ...INPUT, colors: { ...INPUT.colors, primary: "#B83A1" } }, /not a #rrggbb color/],
    ["unknown family", { ...INPUT, fontFamily: "No Such Family Xyz" }, /Google Fonts has no family/],
    ["missing tertiary", { ...INPUT, colors: { primary: "#B83A1B", secondary: "#E3B65C" } }, /no tertiary color was given/],
  ];
  for (const [what, input, expected] of cases) {
    let message = "";
    try {
      await buildKit(input);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    assert(message !== "", `${what} was accepted`);
    assert(expected.test(message), `${what} failed for the wrong reason: ${message}`);
  }
});

await h.run();
rmSync(work, { recursive: true, force: true });
