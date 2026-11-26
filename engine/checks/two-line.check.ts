/**
 * A long name on two lines (FRI-1728): the setting, the break, the
 * geometry, the kit's files, and the stress test's honest answer.
 *
 *   node --env-file-if-exists=/home/sprite/gala.env --experimental-strip-types --no-warnings engine/checks/two-line.check.ts
 *
 * Jev and the models are called, so the whole run is for the Sprite. The
 * geometry and file checks need only Google Fonts and run anywhere. Storage
 * is memory.
 *
 * What this proves:
 *   1. Jev reads "one line or two" from varied wording at the wordmark and
 *      the lockup (the founder's two walk requests among them), together
 *      with the settings read in the same call, and a message about
 *      something else leaves it alone;
 *   2. a two-word name breaks after its first word with no question asked;
 *      a three-word name breaks where the message says, and where it says
 *      nothing, at the boundary that balances the lines; a one-word name
 *      stays on one line and says why;
 *   3. the geometry, in a real typeface: lines centered on each other in
 *      the wordmark and the stacked lockup, left-aligned in the primary
 *      lockup, never overlapping, one line advance of the typeface apart;
 *      the primary block centered on the mark and no taller than its box;
 *      the stacked block below the mark by the gap; a one-line name drawn
 *      exactly as before;
 *   4. the kit's SVG files carry the name on two lines (read back from
 *      their path data) for the primary, stacked and wordmark lock-ups in
 *      every variant, a name-only kit's wordmark too (its square is drawn
 *      from it), and one line when no break is set;
 *   5. at the stress test, the founder's 7:48 request gets the can't-do
 *      with "the name is set at the lockup, next", and nothing is drawn;
 *   6. the step facts: the wordmark and the lockup can set the lines; the
 *      setting is kept on the card, carried from the wordmark to the
 *      lockup, read by the kit from the lockup first, and a whole turn at
 *      the wordmark and at the lockup writes it onto the card.
 *
 * What it does not prove: other wordings (each Jev answer is one model's
 * reading); the EPS and PNG files, the square and the social image are
 * drawn from the same artworks as the SVG files (index.ts, render.ts) but
 * are not parsed here: the check counts them and compares the two-line
 * primary PNG's proportions with the one-line one's; that the cards draw the lines
 * as the files do (the cards are CSS, checked in the preview, not here);
 * names in scripts other than Latin; the quality of Gala's lines.
 *
 * A Jev or model refusal mid-run is a harness failure, not a product
 * result: the check fails with the error, and the run is re-run.
 */
import { readFileSync } from "node:fs";
import { assert, assertClose, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { buildKit, nameLines } from "../../kit/src/index.ts";
import { lineAdvanceEm, loadFont, setLines, setText, type FetchLike } from "../../kit/src/font.ts";
import { inkBox, LOCKUP_RATIOS, primaryLockup, stackedLockup, wordmarkArtwork, type Artwork } from "../../kit/src/layout.ts";
import { bounds, parsePath, type Box, type Segment } from "../../kit/src/path.ts";
import { traceMark } from "../../kit/src/trace.ts";
import { runTurn } from "../loop.ts";
import { assertComplete, loadPrompt } from "../prompt.ts";
import { CASE, describeSettings, LAYOUT, LINES, readBreak, readSettings, SPACE_BETWEEN, SPACING, type Setting } from "../settings.ts";
import { steer } from "../steer.ts";
import { STEP_FACTS } from "../stepFacts.ts";
import { linesOf, nameBreakOf, ONE_WORD, settleLines } from "../stages/wordmark.ts";
import { Turn } from "../turn.ts";
import { projectAt } from "./project.ts";
import { TWO_LINE_TYPE } from "../../src/studio/artifacts/nameLines.ts";

const h = createHarness("A long name on two lines (FRI-1728)");
const fetcher = globalThis.fetch as unknown as FetchLike;
const FAMILY = "Young Serif";
const TWO = "Fernhollow Waterworks";

// 1. The setting, read by Jev.

const START = { case: "asTyped", spacing: "asDrawn", layout: "sideBySide", spaceBetween: "asSet", lines: "oneLine" } as const;
type Field = keyof typeof START;
const SETTINGS: Record<Field, Setting<string>> = { case: CASE, spacing: SPACING, layout: LAYOUT, spaceBetween: SPACE_BETWEEN, lines: LINES };
const GROUPS = { wordmark: ["case", "spacing", "lines"], lockup: ["layout", "spaceBetween", "lines"] } as const;
type Reading = { card: keyof typeof GROUPS; said: string; start?: Partial<Record<Field, string>>; expect: Partial<Record<Field, string>> };

const READINGS: Reading[] = [
  { card: "wordmark", said: "Is it possible to stack the words 'Fernhollow' and 'Waterworks' so the wordmark doesn't run so wide?", expect: { lines: "twoLines" } },
  { card: "wordmark", said: "Put the second word under the first.", expect: { lines: "twoLines" } },
  { card: "wordmark", said: "Break the name onto two lines.", expect: { lines: "twoLines" } },
  { card: "wordmark", said: "Two lines, and all caps please.", expect: { lines: "twoLines", case: "allCaps" } },
  { card: "wordmark", said: "Actually keep the whole name on a single line.", start: { lines: "twoLines" }, expect: { lines: "oneLine" } },
  { card: "wordmark", said: "Spread the letters out a bit.", start: { lines: "twoLines" }, expect: { spacing: "wide" } },
  { card: "lockup", said: "Can we break up the word mark so that Fernhollow is on top of Waterworks and they're all centered? It goes: symbol, Fernhollow, and Waterworks, one in each row.", expect: { lines: "twoLines", layout: "stacked" } },
  { card: "lockup", said: "Keep the symbol on the left but set the name on two lines beside it.", expect: { lines: "twoLines" } },
  { card: "lockup", said: "Unstack the name, one line is better.", start: { lines: "twoLines" }, expect: { lines: "oneLine" } },
  { card: "lockup", said: "More space between the symbol and the name.", start: { lines: "twoLines" }, expect: { spaceBetween: "wide" } },
];

for (const entry of READINGS) {
  const fields = GROUPS[entry.card];
  const expected = Object.entries(entry.expect).map(([field, value]) => `${field} ${value}`).join(", ");
  h.check(`1. ${entry.card}: "${entry.said}" → ${expected}`, async () => {
    const start = { ...START, ...entry.start };
    const read = await readSettings(entry.said, Object.fromEntries(fields.map((field) => [field, { setting: SETTINGS[field], current: start[field] }])));
    console.log(`  ${describeSettings(entry.card, read)}`);
    for (const field of fields) assertEqual(read[field]!.value, entry.expect[field] ?? start[field], field);
  });
}

// 2. The break.

const THREE = "Fernhollow Waterworks Group";
const BALANCED_MARKER = 2;

h.check("2a. a two-word name breaks after its first word, with no question asked", async () => {
  let asked = false;
  const read = await readBreak("put it on two lines", TWO, null, async () => ((asked = true), 1));
  assertEqual(read.breakAfter, 1, "breakAfter");
  assertEqual(read.confidence, null, "Jev was asked");
  assertEqual(asked, false, "the balance was measured");
});

for (const [said, after] of [
  ['Put "Fernhollow" alone on top and "Waterworks Group" below it.', 1],
  ["Fernhollow Waterworks on the first line, then Group on its own line under it.", 2],
] as const) {
  h.check(`2b. "${said}" breaks after word ${after} of "${THREE}"`, async () => {
    const read = await readBreak(said, THREE, null, async () => (after === 1 ? 2 : 1));
    console.log(`  break sure ${read.confidence?.toFixed(2)}`);
    assertEqual(read.breakAfter, after, "breakAfter");
  });
}

h.check("2c. when the message names no break, the balancing rule decides; a break already set stays", async () => {
  const fresh = await readBreak("Can it go on two lines?", THREE, null, async () => BALANCED_MARKER);
  assertEqual(fresh.breakAfter, BALANCED_MARKER, "with none set, the balanced break");
  const kept = await readBreak("Can it go on two lines?", THREE, 1, async () => BALANCED_MARKER);
  assertEqual(kept.breakAfter, 1, "the break already set");
});

h.check("2d. the balancing rule, measured in the typeface, picks the boundary with the closest line widths", async () => {
  const name = "Ab Cd Efghijklmnop";
  // Jev is asked where to break; the message names no break, so the balance decides.
  const { lines } = await settleLines("Two lines, please.", name, FAMILY, 0, { lines: "oneLine", breakAfter: null }, "twoLines", true, new AbortController().signal);
  assertEqual(lines.breakAfter, 2, "breakAfter for \"Ab Cd\" over \"Efghijklmnop\"");
});

h.check("2e. a one-word name stays on one line, and Gala is told why", async () => {
  const signal = new AbortController().signal;
  const asked = await settleLines("Put it on two lines", "Gala", FAMILY, 0, { lines: "oneLine", breakAfter: null }, "twoLines", true, signal);
  assertEqual(asked, { lines: { lines: "oneLine", breakAfter: null }, refused: true }, "asked for two lines");
  const notAsked = await settleLines("Make it bolder", "Gala", FAMILY, 0, { lines: "oneLine", breakAfter: null }, "oneLine", false, signal);
  assertEqual(notAsked.refused, false, "not asked");
  assert(ONE_WORD.includes("one word") && ONE_WORD.includes("between words"), "the reason");
});

// 3. Geometry.

/** A shape's contours, each with its ink box. */
function contours(segments: Segment[]): Box[] {
  const runs: Segment[][] = [];
  for (const segment of segments) {
    if (segment.op === "M") runs.push([]);
    runs[runs.length - 1]?.push(segment);
  }
  return runs.filter((run) => run.length > 1).map(bounds);
}

/** The wordmark's ink split into lines: contours grouped across the widest empty band of rows, when it is wider than a hairline. */
function linesIn(art: Artwork): Box[] {
  const boxes = contours(art.shapes.filter((shape) => shape.part === "wordmark").flatMap((shape) => shape.segments));
  const sorted = [...boxes].sort((a, b) => a.y - b.y);
  const groups: Box[][] = [[sorted[0]!]];
  let reach = sorted[0]!.y + sorted[0]!.height;
  for (const box of sorted.slice(1)) {
    if (box.y > reach) groups.push([]);
    groups[groups.length - 1]!.push(box);
    reach = Math.max(reach, box.y + box.height);
  }
  return groups.map((group) => {
    const x = Math.min(...group.map((b) => b.x));
    const y = Math.min(...group.map((b) => b.y));
    return { x, y, width: Math.max(...group.map((b) => b.x + b.width)) - x, height: Math.max(...group.map((b) => b.y + b.height)) - y };
  });
}

const font = loadFont(FAMILY, 400, fetcher);
const mark = traceMark(new Uint8Array(readFileSync(new URL("../../kit/fixtures/spike_mark.png", import.meta.url))));
const setter = (lines: string[]) => async () => {
  const loaded = await font;
  return (size: number, align?: "center" | "left") => setLines(loaded, lines, size, 0, align);
};
const TWO_LINES = nameLines(TWO, 1);

h.check("3a. the wordmark: two lines, centered on each other, one line advance of the typeface apart, not overlapping", async () => {
  const loaded = await font;
  const art = wordmarkArtwork(await setter(TWO_LINES)());
  const [top, bottom, extra] = linesIn(art);
  assert(top !== undefined && bottom !== undefined && extra === undefined, "the wordmark is not on two lines");
  assertClose(top.x + top.width / 2, bottom.x + bottom.width / 2, 0.5, "line centers");
  assert(bottom.y > top.y + top.height, "the lines overlap");
  const set = setLines(loaded, TWO_LINES, 1000, 0, "center");
  assertClose(set.lastBaseline, lineAdvanceEm(loaded) * 1000, 0.001, "baseline to baseline");
  console.log(`  line advance ${lineAdvanceEm(loaded).toFixed(3)} em (${FAMILY}'s own metrics)`);
});

h.check("3b. the stacked lockup: the mark, then the two lines, all centered, the block below the mark by the gap", async () => {
  const art = stackedLockup(await mark, await setter(TWO_LINES)());
  const m = inkBox(art, "mark");
  const [top, bottom, extra] = linesIn(art);
  assert(top !== undefined && bottom !== undefined && extra === undefined, "the name is not on two lines");
  const center = m.x + m.width / 2;
  assertClose(top.x + top.width / 2, center, 0.5, "line 1 center against the mark");
  assertClose(bottom.x + bottom.width / 2, center, 0.5, "line 2 center against the mark");
  assert(top.y >= m.y + m.height + 1000 * LOCKUP_RATIOS.stacked.gap - 0.5, "the name comes closer to the mark than the gap");
  assert(bottom.y > top.y + top.height, "the lines overlap");
});

h.check("3c. the primary lockup: the lines left-aligned beside the mark, the block centered on it and no taller than its box", async () => {
  const loaded = await font;
  const art = primaryLockup(await mark, await setter(TWO_LINES)());
  const m = inkBox(art, "mark");
  const [top, bottom, extra] = linesIn(art);
  assert(top !== undefined && bottom !== undefined && extra === undefined, "the name is not on two lines");
  assertClose(top.x, bottom.x, 0.5, "left edges");
  assert(top.x >= m.x + m.width, "the name overlaps the mark");
  assert(bottom.y > top.y + top.height, "the lines overlap");
  // The block runs from line 1's cap height to line 2's baseline; it is centered where one line's cap height is.
  const set = setLines(loaded, TWO_LINES, 1000 * LOCKUP_RATIOS.primary.type, 0, "left");
  const block = set.capHeight + set.lastBaseline;
  assert(block <= 1000, `the block is ${block.toFixed(1)}, taller than the mark's box`);
  const box = inkBox(art, "wordmark");
  const firstBaseline = box.y - bounds(set.segments).y;
  assertClose(firstBaseline - set.capHeight + block / 2, m.y + m.height / 2, 1, "the block's center against the mark's");
});

h.check("3d. a name on one line is drawn exactly as before the setting", async () => {
  const loaded = await font;
  const before = (size: number) => setText(loaded, TWO, size);
  const after = await setter([TWO])();
  const m = await mark;
  for (const [label, draw] of [
    ["primary", (s: Parameters<typeof primaryLockup>[1]) => primaryLockup(m, s)],
    ["stacked", (s: Parameters<typeof primaryLockup>[1]) => stackedLockup(m, s)],
    ["wordmark", (s: Parameters<typeof primaryLockup>[1]) => wordmarkArtwork(s)],
  ] as const) {
    assertEqual(JSON.stringify(draw(after)), JSON.stringify(draw(before)), label);
  }
});

// 4. The kit's files.

const COLORS = { primary: "#B83A1B", secondary: "#2B2622" };
const COLORWAY = { mark: "primary", wordmark: "secondary" } as const;

/**
 * The name's lines in an SVG file, read from the wordmark's path: the last
 * one, as layout.ts orders the shapes (mark, then name), and filled with
 * the wordmark's color.
 */
function linesInSvg(svg: string, fill: string): number {
  const paths = [...svg.matchAll(/<path fill="([^"]+)"[^>]* d="([^"]+)"\/>/g)];
  const last = paths[paths.length - 1];
  if (last === undefined || last[1]!.toUpperCase() !== fill.toUpperCase()) return 0;
  const segments = parsePath(last[2]!);
  const art: Artwork = { width: 0, height: 0, shapes: [{ part: "wordmark", segments, fillRule: "nonzero" }] };
  return segments.length === 0 ? 0 : linesIn(art).length;
}

async function kitFiles(breakAfter: number | undefined, withMark = true) {
  const markBytes = new Uint8Array(readFileSync(new URL("../../kit/fixtures/spike_mark.png", import.meta.url)));
  return buildKit({ ...(withMark ? { mark: { bytes: markBytes, mime: "image/png" as const } } : {}), name: TWO, breakAfter, fontFamily: FAMILY, colors: COLORS, colorway: COLORWAY });
}

h.check("4a. every primary, stacked and wordmark SVG carries the name on two lines; the EPS and PNG files are there", async () => {
  const kit = await kitFiles(1);
  const decoder = new TextDecoder();
  const svgs = kit.files.filter((file) => file.format === "svg" && file.lockup !== "icon");
  assertEqual(svgs.length, 9, "SVG files with the name");
  for (const file of svgs) {
    const fill = file.variant === "color" ? COLORS.secondary : file.variant === "black" ? "#000000" : "#FFFFFF";
    assertEqual(linesInSvg(decoder.decode(file.bytes), fill), 2, `${file.path} lines`);
  }
  // The EPS and PNG files are drawn from the same artwork; they exist for each lockup and variant.
  for (const format of ["eps", "png"] as const) assertEqual(kit.files.filter((file) => file.format === format && ["primary", "stacked", "wordmark"].includes(file.lockup)).length, 9, `${format} files`);
  const social = kit.files.find((file) => file.lockup === "social")!;
  const primaryPng = kit.files.find((file) => file.path.endsWith("-primary-color.png"))!;
  const onePrimary = (await kitFiles(undefined)).files.find((file) => file.path.endsWith("-primary-color.png"))!;
  assert(primaryPng.width / primaryPng.height < onePrimary.width / onePrimary.height, "the two-line primary PNG is not narrower for its height than the one-line one");
  assert(social.bytes.length > 0, "the social image");
});

h.check("4b. a name-only kit's wordmark, which its square shows, is on two lines", async () => {
  const kit = await kitFiles(1, false);
  assertEqual(kit.files.some((file) => file.lockup === "primary"), false, "a name-only kit has no lockup");
  const wordmark = kit.files.find((file) => file.path.endsWith("-wordmark-color.svg"))!;
  assertEqual(linesInSvg(new TextDecoder().decode(wordmark.bytes), COLORS.secondary), 2, "wordmark lines");
  assert(kit.files.some((file) => file.lockup === "square"), "the square");
});

h.check("4c. with no break set, every file carries the name on one line; a break that leaves a line empty is refused", async () => {
  const kit = await kitFiles(undefined);
  const decoder = new TextDecoder();
  for (const file of kit.files.filter((entry) => entry.format === "svg" && entry.lockup !== "icon" && entry.variant === "color")) {
    assertEqual(linesInSvg(decoder.decode(file.bytes), COLORS.secondary), 1, `${file.path} lines`);
  }
  let refused = false;
  await kitFiles(2).catch(() => (refused = true));
  assertEqual(refused, true, "breakAfter 2 on a two-word name");
});

// 5. The stress test.

const prompt = await loadPrompt();
assertComplete(prompt);

h.check("5. at the stress test, the 7:48 request gets the can't-do with its reason, and nothing is drawn", async () => {
  const store = projectAt("stressTest");
  const before = store.messages.length;
  store.visitorSays("The word mark goes outside the bounds. Is it possible to stack the words 'Ember &' and 'Rye' so that that doesn't happen?");
  const turn = new Turn(store, prompt, new AbortController().signal);
  await turn.read();
  await steer(turn);
  const next = turn.take();
  assertEqual(next?.act, "talk", "what steering left");
  const facts = next?.act === "talk" ? (next.facts ?? {}) : {};
  const row = STEP_FACTS.stressTest.cantDo.find((item) => item.what === facts.cannotDo);
  assert(row !== undefined, `what Gala can't do: ${String(facts.cannotDo)}`);
  assertEqual(facts.reason, "the name is set at the lockup, next", "the reason");
  assertEqual(store.project.stage, "stressTest", "the stage");
  assertEqual(store.messages.length, before + 1, "cards written");
});

// 6. Step facts, and the setting kept.

h.check("6a. the wordmark and the lockup can set the name on two lines; the stress test sends it to the lockup", () => {
  for (const stage of ["wordmark", "lockup"] as const) assert(STEP_FACTS[stage].canDo.some((entry) => entry.includes("one line or two")), `${stage} canDo`);
  assert(STEP_FACTS.stressTest.cantDo.some((entry) => entry.reason === "the name is set at the lockup, next"), "the stress test row");
});

h.check("6a2. the lockup card draws a two-line name at the kit's own ratios to the symbol", () => {
  assertEqual(TWO_LINE_TYPE.sideBySide, LOCKUP_RATIOS.primary.type, "side by side");
  assertEqual(TWO_LINE_TYPE.stacked, LOCKUP_RATIOS.stacked.type, "stacked");
});

h.check("6b. the setting is read from the card, carried to the lockup, and read by the kit from the lockup first", async () => {
  assertEqual(linesOf({ lines: "twoLines", breakAfter: 1 }), { lines: "twoLines", breakAfter: 1 }, "a two-line card");
  assertEqual(linesOf({ case: "allCaps" }), { lines: "oneLine", breakAfter: null }, "a card from before the setting");
  const store = projectAt("lockup");
  store.project.brandName = TWO;
  Object.assign(store.latest("wordmark").artifact!, { brandName: TWO, lines: "twoLines", breakAfter: 1 });
  const read = async () => {
    const turn = new Turn(store, prompt, new AbortController().signal);
    await turn.read();
    return nameBreakOf(turn);
  };
  // The lockup card from before the setting has no lines of its own: the wordmark's are used.
  delete store.latest("lockup").artifact!.lines;
  assertEqual(linesOf(store.latest("lockup").artifact).lines, "oneLine", "the lockup's own");
  Object.assign(store.latest("lockup").artifact!, { lines: "oneLine", breakAfter: null });
  assertEqual(await read(), undefined, "the lockup's one line wins over the wordmark's two");
  Object.assign(store.latest("lockup").artifact!, { lines: "twoLines", breakAfter: 1 });
  assertEqual(await read(), 1, "the lockup's two lines");
});

h.check("6c. a whole turn at the wordmark writes two lines onto the card, and keeps them through a case change", async () => {
  const store = projectAt("wordmark");
  store.project.brandName = TWO;
  Object.assign(store.latest("wordmark").artifact!, { brandName: TWO });
  store.visitorSays("Put Waterworks on a second line under Fernhollow.");
  assertEqual(await runTurn(store, prompt, new AbortController().signal), "done", "the turn");
  const card = store.latest("wordmark").artifact!;
  assertEqual([card.lines, card.breakAfter], ["twoLines", 1], "the card's lines");
  store.visitorSays("Now make it all caps.");
  assertEqual(await runTurn(store, prompt, new AbortController().signal), "done", "the second turn");
  const after = store.latest("wordmark").artifact!;
  assertEqual([after.case, after.lines, after.breakAfter], ["allCaps", "twoLines", 1], "case changed, lines kept");
});

h.check("6d. a whole turn at the lockup: the founder's 7:51 request sets the name on two lines, stacked, and draws no new symbol", async () => {
  const store = projectAt("lockup");
  store.project.brandName = TWO;
  Object.assign(store.latest("wordmark").artifact!, { brandName: TWO });
  Object.assign(store.latest("lockup").artifact!, { brandName: TWO });
  store.visitorSays("Can we break up the word mark so that Fernhollow is on top of Waterworks and they're all centered? It goes: symbol, Fernhollow, and Waterworks, one in each row.");
  assertEqual(await runTurn(store, prompt, new AbortController().signal), "done", "the turn");
  assertEqual(store.project.stage, "lockup", "the stage");
  const card = store.latest("lockup").artifact!;
  assertEqual([card.layout, card.lines, card.breakAfter], ["stacked", "twoLines", 1], "the card");
  assert(!store.messages.some((message) => message.kind === "variationSet" && message.id !== "card-variationSet"), "a new round of variations was drawn");
});

await h.run();
