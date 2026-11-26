/**
 * The kit shows the colors as picked (FRI-1730), without a model.
 *
 *   node --experimental-strip-types --no-warnings engine/checks/colors-as-picked.check.ts
 *
 * The kit is built for real (the kit's spike mark, Young Serif fetched from
 * Google Fonts). The engine's kit step runs on a memory store with the
 * model's words stubbed, for a logo of the name alone on a brand-color
 * ground, so its zips, its card and its facts can be read.
 *
 * What this proves:
 * - On a brand-color ground (Ember & Rye, tertiary on secondary): every
 *   lock-up has an on-ground SVG, EPS and PNG; the SVG's first path is a
 *   rectangle over the whole view box in the ground hex, the EPS paints the
 *   ground first, and the PNG's corner pixel is the opaque ground; the
 *   transparent files stay.
 * - Through the engine's kit step: the on-ground files are stored with the
 *   label "wordmark, ground, SVG" and their names sit in the SVG, EPS, PNG
 *   and whole-kit zips; the card's colorway preview sits on the ground hex;
 *   `kitHolds` names the on-ground files and the Colorway section.
 * - On white or neutral: no on-ground file, and the card stays on white.
 * - Primary black with both fills primary (walk note 22's Quiet Stock): no
 *   "color" files, no two PNG files with the same bytes (so no lock-up ships
 *   twice), and the spec says the all-black set holds the colorway.
 * - A black mark with a tertiary name: the primary, stacked and wordmark
 *   lock-ups keep their "color" files; the icon's go, and the all-black icon
 *   stands in.
 * - The spec carries each color as picked with its use, and the Kit view
 *   (`kitView`, what the panel renders) shows each picked hex, the Colorway
 *   section on the ground with one badge per pair on the ground, every
 *   badge in the kit's own labels (one rounding on the sheet), the
 *   clear space on the ground with the mark's color for its line, and the
 *   colorway's file as the picture.
 *
 * What it does not prove: how the panel and the card look (the visual gate
 * in the PR compares them with the frames); that a zip opens in an archive
 * tool (only that each file's name is inside it); the EPS's rendering (the
 * kit's verify-kit reads EPS back through Ghostscript); what Gala's real
 * line says about the kit (the model is stubbed).
 */
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { buildKit, type KitInput, type KitResult } from "../../kit/src/index.ts";
import { kitView, type KitSpecData } from "../../src/studio/panel/colorway.ts";
import { kit } from "../stages/kit.ts";
import type { MemoryStore } from "../store-memory.ts";
import type { Stage } from "../store.ts";
import { Turn } from "../turn.ts";
import { projectAt } from "./project.ts";

const MARK = { bytes: new Uint8Array(readFileSync(new URL("../../kit/fixtures/spike_mark.png", import.meta.url))), mime: "image/png" as const };
const SLUG = "ember-and-rye";
const LOCKUPS = ["primary", "stacked", "icon", "wordmark"] as const;
const FORMATS = ["svg", "eps", "png"] as const;

const EMBER = { primary: "#B83A1B", secondary: "#E3B65C", tertiary: "#2B2622" };
const INPUTS: Record<"ground" | "white" | "black" | "mixed", KitInput> = {
  ground: { mark: MARK, name: "Ember & Rye", fontFamily: "Young Serif", colors: EMBER, colorway: { mark: "tertiary", wordmark: "tertiary", ground: "secondary", letter: "C", name: "Quiet ground" } },
  white: { mark: MARK, name: "Ember & Rye", fontFamily: "Young Serif", colors: EMBER, colorway: { mark: "primary", wordmark: "tertiary" } },
  black: { mark: MARK, name: "Ember & Rye", fontFamily: "Young Serif", colors: { primary: "#000000", secondary: "#CEF82D" }, colorway: { mark: "primary", wordmark: "primary", ground: "secondary", letter: "C", name: "Quiet Stock" } },
  // The seat's gate-1 case: a black mark with a tertiary name. Only the icon (the mark alone) matches the all-black set.
  mixed: { mark: MARK, name: "Ember & Rye", fontFamily: "Young Serif", colors: { primary: "#000000", secondary: "#CEF82D", tertiary: "#2B2622" }, colorway: { mark: "primary", wordmark: "tertiary" } },
};
const built: Partial<Record<keyof typeof INPUTS, KitResult>> = {};
const kitOf = (key: keyof typeof INPUTS): KitResult => {
  const result = built[key];
  if (result === undefined) throw new Error(`the ${key} kit was not built`);
  return result;
};
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const pathsOf = (result: KitResult) => result.files.map((file) => file.path);
const fileAt = (result: KitResult, path: string) => {
  const file = result.files.find((entry) => entry.path === path);
  if (file === undefined) throw new Error(`missing ${path}`);
  return file;
};

/**
 * The first pixel of an 8-bit RGBA PNG. Whatever the first row's filter,
 * its first pixel is stored as is (no left, upper or upper-left neighbour).
 */
function cornerPixel(bytes: Uint8Array): number[] {
  const buffer = Buffer.from(bytes);
  assertEqual([buffer[24], buffer[25]], [8, 6], "PNG bit depth and color type (8-bit RGBA)");
  const idat: Buffer[] = [];
  for (let at = 8; at < buffer.length; ) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString("latin1", at + 4, at + 8);
    if (type === "IDAT") idat.push(buffer.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return [...raw.subarray(1, 5)];
}

const h = createHarness("The kit shows the colors as picked (FRI-1730)");

for (const key of Object.keys(INPUTS) as (keyof typeof INPUTS)[]) {
  h.check(`the ${key} kit builds`, async () => {
    built[key] = await buildKit(INPUTS[key]);
  });
}

// ---- a brand-color ground ------------------------------------------------
for (const lockup of LOCKUPS) {
  h.check(`brand ground: ${lockup} has an on-ground SVG, EPS and PNG, and its transparent files stay`, () => {
    const result = kitOf("ground");
    for (const format of FORMATS) {
      const file = fileAt(result, `${format}/${SLUG}-${lockup}-ground.${format}`);
      assertEqual(file.variant, "ground", `${file.path} variant`);
      for (const variant of ["color", "black", "white"]) fileAt(result, `${format}/${SLUG}-${lockup}-${variant}.${format}`);
    }
  });
  h.check(`brand ground: ${lockup}'s on-ground files have the ground hex behind the fills`, () => {
    const result = kitOf("ground");
    const svg = text(fileAt(result, `svg/${SLUG}-${lockup}-ground.svg`).bytes);
    const view = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    assert(view !== null, "no view box");
    const first = /<path fill="(#[0-9A-F]{6})"[^>]* d="M0 0L([\d.]+) 0L([\d.]+) ([\d.]+)L0 ([\d.]+)Z"/i.exec(svg);
    assert(first !== null, "the first path is not a rectangle from the origin");
    assertEqual(first[1]!.toUpperCase(), EMBER.secondary, "the ground fill");
    assert(Math.abs(Number(first[2]) - Number(view[1])) < 0.02 && Math.abs(Number(first[4]) - Number(view[2])) < 0.02, "the ground does not cover the view box");
    assert(svg.indexOf(`fill="${EMBER.secondary}"`) < svg.indexOf(`fill="${EMBER.tertiary}"`), "the ground is not painted before the mark and the name");
    const eps = text(fileAt(result, `eps/${SLUG}-${lockup}-ground.eps`).bytes);
    const firstColor = /^(.*) setrgbcolor$/m.exec(eps);
    assert(firstColor !== null && firstColor[1] === "0.8902 0.7137 0.3608", `the EPS paints ${firstColor?.[1]} first, not the ground`);
    assertEqual(cornerPixel(fileAt(result, `png/${SLUG}-${lockup}-ground.png`).bytes), [0xe3, 0xb6, 0x5c, 255], "the PNG's corner pixel");
  });
}

h.check("brand ground: the spec carries each color as picked, its use, and the pair on the ground", () => {
  const spec = kitOf("ground").spec;
  assertEqual(spec.colors.map((color) => color.hex), [EMBER.primary, EMBER.secondary, EMBER.tertiary], "the colors as picked");
  assertEqual(spec.colors.map((color) => color.uses), [[], ["ground"], ["mark", "wordmark"]], "the uses");
  assert(spec.colors.every((color) => !color.ladder.some((step) => step.hex === color.hex)), "a ladder step equals the picked hex: the base chip would show");
  assertEqual(spec.colorway?.onGround, true, "onGround");
  assertEqual(spec.colorway?.groundHex, EMBER.secondary, "the ground hex");
  assert(spec.pairs.some((pair) => pair.foreground === "tertiary" && pair.background === "secondary"), "no tertiary-on-secondary pair");
});

h.check("brand ground: the Kit view shows the picked colors, the Colorway section and the clear space on the ground", () => {
  const files: Record<string, string> = { "primary, color, SVG": "url:primary-color" };
  const view = kitView("Ember & Rye", kitOf("ground").spec as unknown as KitSpecData, (label) => files[label]);
  assertEqual(view.colors.map((color) => color.hex), [EMBER.primary, EMBER.secondary, EMBER.tertiary], "the swatches");
  assertEqual(view.colors.map((color) => color.use), ["Headlines and accents. Not in this colorway.", "The ground in your colorway.", "The mark and the name in your colorway."], "the uses");
  assertEqual(
    view.colors.map((color) => color.contrast.map((badge) => badge.label)),
    kitOf("ground").spec.colors.map((color) => [`On white ${color.contrast.onWhite.label}`, `On black ${color.contrast.onBlack.label}`]),
    "the Colors badges are not the kit's labels",
  );
  assert(view.colorway !== undefined, "no Colorway section");
  assertEqual(view.colorway.paper, EMBER.secondary, "the Colorway paper");
  assertEqual(view.colorway.title, "C · Quiet ground", "the colorway's letter and name");
  assertEqual(view.colorway.pairs, [{ label: "Tertiary on secondary 7.9:1", pass: true }], "the badges");
  assertEqual(view.colorway.previewUrl, "url:primary-color", "the Colorway picture");
  assertEqual(view.clearSpace.paper, EMBER.secondary, "the clear-space paper");
  assertEqual(view.clearSpace.zoneColor, EMBER.tertiary, "the clear-space line");
});

// ---- the engine's kit step, a name alone on a brand ground ---------------
/** The project at its kit step, a logo of the name alone, colorway `assignment` chosen. */
function readyForKit(assignment: { mark: string; wordmark: string; ground: string }): MemoryStore {
  const store = projectAt("lockup");
  store.project.stage = "kit" as Stage;
  const opener = store.messages.find((message) => message.kind === "symbolOpener")!;
  opener.artifact = { ...opener.artifact, answered: "noSymbol" };
  const colors = { primary: EMBER.primary, secondary: EMBER.secondary, tertiary: EMBER.tertiary };
  store.messages.push({ id: "card-colorPicker", author: "gala", kind: "colorPicker", text: null, artifact: { say: "Pick your colors.", colors, saved: true }, upload: null });
  store.messages.push({
    id: "card-colorwaySet",
    author: "gala",
    kind: "colorwaySet",
    text: null,
    artifact: { say: "Three colorways.", colors, colorways: [{ id: "cw-c", letter: "C", name: "Quiet ground", rationale: "", assignment }], chosenId: "cw-c" },
    upload: null,
  });
  return store;
}

/** Runs the kit step with the model stubbed; returns the store and the facts the kit line was asked with. */
async function runKit(assignment: { mark: string; wordmark: string; ground: string }): Promise<{ store: MemoryStore; facts: Record<string, unknown> }> {
  const store = readyForKit(assignment);
  const turn = new Turn(store, {} as never, new AbortController().signal);
  assert(await turn.read(), "the turn could not open");
  let facts: Record<string, unknown> = {};
  turn.think = (async (request: { section: string; facts: Record<string, unknown> }) => {
    if (request.section === "kit") facts = request.facts;
    return { say: "", lines: [] };
  }) as Turn["think"];
  turn.mayShow = async () => false;
  await kit(turn);
  return { store, facts };
}

const ground = { mark: "tertiary", wordmark: "tertiary", ground: "secondary" };
let stepRun: { store: MemoryStore; facts: Record<string, unknown> } | null = null;
h.check("kit step (brand ground): runs", async () => {
  stepRun = await runKit(ground);
});

h.check("kit step (brand ground): on-ground files stored with their labels and named in every zip", async () => {
  assert(stepRun !== null, "the kit step did not run");
  const store = stepRun.store;
  const stored = store.kit!;
  for (const format of ["SVG", "EPS", "PNG"]) assert(stored.files.some((file) => file.label === `wordmark, ground, ${format}`), `no "wordmark, ground, ${format}" file`);
  for (const [label, path] of [["SVG", "svg"], ["EPS", "eps"], ["PNG", "png"], ["Kit", null]] as const) {
    const download = stored.downloads.find((entry) => entry.label === label);
    assert(download !== undefined, `no ${label} download`);
    const bytes = Buffer.from((await store.readFile(download.fileId)).bytes);
    for (const format of path === null ? FORMATS : [path]) {
      const name = `${format}/${SLUG}-wordmark-ground.${format}`;
      assert(bytes.includes(Buffer.from(name)), `${name} is not in the ${label} zip`);
    }
  }
});

h.check("kit step (brand ground): the card's colorway preview sits on the ground; kitHolds names the on-ground files and the Colorway section", () => {
  assert(stepRun !== null, "the kit step did not run");
  const card = stepRun.store.latest("kit").artifact!;
  assertEqual(card.lockups.map((lockup: { ground: string }) => lockup.ground), [EMBER.secondary, "white", "black"], "the papers");
  assert(card.lockups.every((lockup: { previewFileId?: string }) => typeof lockup.previewFileId === "string"), "a preview has no file");
  const holds = stepRun.facts.kitHolds as { onGroundFiles?: string; specSheet: string[] };
  assert(typeof holds.onGroundFiles === "string" && holds.onGroundFiles.includes("ground"), "kitHolds does not name the on-ground files");
  assert(holds.specSheet.some((line) => line.startsWith("the colorway")), "kitHolds does not name the Colorway section");
  assert(holds.specSheet.some((line) => line.includes("as picked")), "kitHolds does not name the colors as picked");
});

// ---- white or neutral ----------------------------------------------------
h.check("white or neutral: no on-ground file; the transparent set is whole", () => {
  const result = kitOf("white");
  assertEqual(pathsOf(result).filter((path) => path.includes("-ground.")).length, 0, "on-ground files");
  assertEqual(result.files.length, LOCKUPS.length * 3 * FORMATS.length + 2, "files");
  assertEqual(result.spec.colorway?.onGround, false, "onGround");
});

h.check("kit step (white colorway): no on-ground file, the preview stays on white, no on-ground fact", async () => {
  const { store, facts } = await runKit({ mark: "primary", wordmark: "tertiary", ground: "white" });
  assert(!store.kit!.files.some((file) => file.label.includes("ground")), "an on-ground file was stored");
  assertEqual(store.latest("kit").artifact!.lockups[0].ground, "white", "the colorway preview's paper");
  assertEqual((facts.kitHolds as { onGroundFiles?: string }).onGroundFiles, undefined, "onGroundFiles");
});

// ---- primary black, both fills primary -----------------------------------
h.check("black colorway: no color files; the all-black set stands in, in the spec", () => {
  const result = kitOf("black");
  assertEqual(pathsOf(result).filter((path) => /-color\./.test(path)).length, 0, "color files");
  assertEqual(result.spec.colorway?.files, { primary: "black", stacked: "black", icon: "black", wordmark: "black" }, "spec.colorway.files");
  for (const lockup of LOCKUPS) for (const format of FORMATS) fileAt(result, `${format}/${SLUG}-${lockup}-black.${format}`);
});

h.check("black colorway: no two PNG files carry the same bytes, so no lock-up ships twice", () => {
  const seen = new Map<string, string>();
  for (const file of kitOf("black").files.filter((entry) => entry.format === "png")) {
    const key = Buffer.from(file.bytes).toString("base64");
    assert(!seen.has(key), `${file.path} is a byte copy of ${seen.get(key)}`);
    seen.set(key, file.path);
  }
});

h.check("black colorway: the Kit view pictures the all-black file on the lime ground with a black line", () => {
  const files: Record<string, string> = { "primary, black, SVG": "url:primary-black" };
  const view = kitView("Ember & Rye", kitOf("black").spec as unknown as KitSpecData, (label) => files[label]);
  assertEqual(view.colorway?.previewUrl, "url:primary-black", "the Colorway picture");
  assertEqual(view.colorway?.paper, "#CEF82D", "the Colorway paper");
  assertEqual(view.clearSpace.zoneColor, "#000000", "the clear-space line");
  assertEqual(view.colors.map((color) => color.hex), ["#000000", "#CEF82D"], "the swatches as picked");
  // One rounding on the sheet (the seat's gate-read): black on lime reads the same in the Colorway badge and in Secondary's own badge.
  const pair = view.colorway?.pairs[0]?.label.split(" ").pop();
  const secondaryOnBlack = view.colors[1]?.contrast[1]?.label.split(" ").pop();
  assertEqual(pair, secondaryOnBlack, "the Colorway badge and the Secondary on-black badge");
});

h.check("black mark, tertiary name: only the icon's color files go; the other lock-ups keep theirs", () => {
  const result = kitOf("mixed");
  assertEqual(result.spec.colorway?.files, { primary: "color", stacked: "color", icon: "black", wordmark: "color" }, "spec.colorway.files");
  for (const format of FORMATS) {
    for (const lockup of ["primary", "stacked", "wordmark"]) fileAt(result, `${format}/${SLUG}-${lockup}-color.${format}`);
    assert(!pathsOf(result).includes(`${format}/${SLUG}-icon-color.${format}`), `icon-color.${format} ships, a copy of icon-black`);
  }
});

await h.run();
