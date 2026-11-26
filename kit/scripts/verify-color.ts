/**
 * verify-color: the ladder, contrast, CMYK and path maths against values
 * computed outside this module.
 *
 * Where the expected values come from:
 * - Ladders: Frilly's palette method, computed once on 2026-11-24
 *   and pasted here. Matching it byte for byte proves this implementation
 *   follows the same method.
 * - Contrast: worked by hand from the WCAG 2.x formula (the working sits
 *   beside each check), cross-checked against the same palette run.
 * - CMYK: the values in the `gala-palette` frame (Figma), which agree with
 *   the straight formula worked by hand.
 *
 * Reach (gate 3b): four anchors cover a warm saturated color, a near-neutral
 * dark, a light warm color and an out-of-gamut green (the chroma clamp). An
 * anchor in a hue region none of these touch is covered only by the shared
 * code path, not by a pinned value.
 */

import { cmyk, contrast, ladder, LADDER_STEPS, luminance, nearestStep } from "../src/color.ts";
import { bounds, parsePath, subpathCount, toPostScript } from "../src/path.ts";
import { assert, assertClose, assertEqual, createHarness } from "./harness.ts";

const h = createHarness("verify-color");

// Frilly's palette method, steps 50..900, computed 2026-11-24.
const METHOD_LADDERS: Record<string, string[]> = {
  "#B83A1B": ["#fff6f3", "#ffece7", "#fdd5cb", "#ffb19e", "#ee8f78", "#d66d54", "#b53717", "#912000", "#500d00", "#340600"],
  "#2B2622": ["#f8f8f7", "#f1f0ef", "#e1dfdd", "#cac6c3", "#b0aba8", "#948f8b", "#6e6863", "#544f4a", "#2d2925", "#1b1916"],
  "#E3B65C": ["#fcf8f0", "#f9efde", "#eadec7", "#dec494", "#c7a86c", "#ad8a44", "#876200", "#674a00", "#372600", "#231700"],
  "#00FF66": ["#eefdf0", "#d9fbdc", "#c0edc5", "#80e18f", "#46ca64", "#00ad43", "#007f2f", "#006122", "#00340e", "#002006"],
};

for (const [anchor, expected] of Object.entries(METHOD_LADDERS)) {
  h.check(`ladder ${anchor} matches Frilly's palette method`, () => {
    assertEqual(ladder(anchor).map((e) => e.hex), expected.map((x) => x.toUpperCase()), `ladder ${anchor}`);
  });
}

h.check("ladder has the ten steps 50 to 900 in order", () => {
  assertEqual(ladder("#B83A1B").map((e) => e.step), [...LADDER_STEPS], "steps");
});

h.check("each ladder darkens monotonically from 50 to 900", () => {
  for (const anchor of Object.keys(METHOD_LADDERS)) {
    const lums = ladder(anchor).map((e) => luminance(e.hex));
    for (let i = 1; i < lums.length; i++) assert(lums[i]! < lums[i - 1]!, `${anchor} step ${LADDER_STEPS[i]} is not darker than ${LADDER_STEPS[i - 1]}`);
  }
});

h.check("an achromatic anchor gives a pure gray ladder", () => {
  for (const { hex } of ladder("#737373")) assert(hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7), `${hex} is not gray`);
});

h.check("nearest step: #B83A1B outlines 600, dark #2B2622 outlines 800", () => {
  assertEqual(nearestStep("#B83A1B", ladder("#B83A1B")), "600", "#B83A1B");
  assertEqual(nearestStep("#2B2622", ladder("#2B2622")), "800", "#2B2622");
});

// Hand-worked: L(#B83A1B) = 0.2126*0.4793 + 0.7152*0.0423 + 0.0722*0.0110 = 0.1329.
h.check("contrast #B83A1B on white is 5.74:1 (hand-worked), label 5.7:1, passes AA text", () => {
  const c = contrast("#B83A1B", "#FFFFFF");
  assertClose(c.ratio, 5.74, 0.01, "ratio");
  assertEqual([c.label, c.aaText, c.aaLarge], ["5.7:1", true, true], "label and passes");
});

h.check("contrast #B83A1B on black is 3.66:1 (hand-worked), fails AA text, passes AA large", () => {
  const c = contrast("#B83A1B", "#000000");
  assertClose(c.ratio, 3.66, 0.01, "ratio");
  assertEqual([c.label, c.aaText, c.aaLarge], ["3.6:1", false, true], "label and passes");
});

// Hand-worked: L(#2B2622) = 0.2126*0.02415 + 0.7152*0.01939 + 0.0722*0.01600 = 0.02016.
h.check("contrast #2B2622 on white is 14.97:1 and on black 1.40:1 (hand-worked)", () => {
  assertClose(contrast("#2B2622", "#FFFFFF").ratio, 14.97, 0.01, "on white");
  assertClose(contrast("#2B2622", "#000000").ratio, 1.4, 0.01, "on black");
});

h.check("contrast is symmetric and black on white is 21:1", () => {
  assertClose(contrast("#000000", "#FFFFFF").ratio, 21, 1e-9, "black/white");
  assertClose(contrast("#FFFFFF", "#B83A1B").ratio, contrast("#B83A1B", "#FFFFFF").ratio, 1e-12, "symmetry");
});

// Hand-worked: L(#777777) = 0.1845, (1.05)/(0.2345) = 4.478.
h.check("a ratio just under 4.5 (#777777 on white, 4.48) is labeled 4.4:1 and fails AA text", () => {
  const c = contrast("#777777", "#FFFFFF");
  assertClose(c.ratio, 4.478, 0.002, "ratio");
  assertEqual([c.label, c.aaText], ["4.4:1", false], "label and pass");
});

h.check("CMYK matches the gala-palette frame (straight formula)", () => {
  assertEqual(cmyk("#B83A1B"), [0, 68, 85, 28], "#B83A1B");
  assertEqual(cmyk("#E3B65C"), [0, 20, 59, 11], "#E3B65C");
  assertEqual(cmyk("#2B2622"), [0, 12, 21, 83], "#2B2622");
  assertEqual(cmyk("#000000"), [0, 0, 0, 100], "black");
  assertEqual(cmyk("#FFFFFF"), [0, 0, 0, 0], "white");
});

h.check("bad hex is refused", () => {
  let threw = false;
  try {
    ladder("#12345");
  } catch {
    threw = true;
  }
  assert(threw, "#12345 was accepted");
});

h.check("path parser: relative commands, H/V and implicit lineto", () => {
  const segs = parsePath("m10 10 h20 v20 l-20 0 20 -20z M0 0 L1 1");
  assertEqual(subpathCount(segs), 2, "subpaths");
  assertEqual(bounds(segs), { x: 0, y: 0, width: 30, height: 30 }, "bounds");
});

h.check("path parser: a quadratic is raised to an exact cubic", () => {
  const [, c] = parsePath("M0 0 Q 50 100 100 0");
  assert(c && c.op === "C", "no cubic");
  assertClose(c.c1.x, 100 / 3, 1e-9, "c1.x");
  assertClose(c.c1.y, 200 / 3, 1e-9, "c1.y");
  assertClose(c.c2.x, 200 / 3, 1e-9, "c2.x");
  // The curve peaks at y = 50 at t = 0.5; bounds must use the extremum, not the control points.
  assertClose(bounds(parsePath("M0 0 Q 50 100 100 0")).height, 50, 1e-9, "height");
});

h.check("path parser refuses arcs instead of guessing", () => {
  let threw = false;
  try {
    parsePath("M0 0 A 10 10 0 0 1 20 0");
  } catch {
    threw = true;
  }
  assert(threw, "arc accepted");
});

h.check("PostScript output flips y into PostScript's y-up space", () => {
  assertEqual(toPostScript(parsePath("M0 0 L10 5 Z"), 100), "0 100 m\n10 95 l\nh", "ps");
});

await h.run();
