/**
 * The font sweep: sets two test names in every family in Google's tag file,
 * through the same `loadFont` and `setText` the wordmark step and the kit
 * use, and groups what fails by cause.
 *
 *   npm run sweep:fonts -- --cache <folder outside the repo> [--out report.json]
 *                          [--concurrency 6] [--only "Alata,Pacifico"]
 *
 * The catalog is the tag file the type step and the type tray read
 * (engine/fonts.ts), so the sweep covers exactly the families a person can
 * be offered or can name. There is no font list here.
 *
 * Downloads are kept in the cache folder, so a second run (after a change to
 * the setter) reads the same font files and downloads nothing again.
 *
 * Gate 3c: a family whose font file could not be downloaded is a result
 * about the download, not about the font. It is counted on its own line and
 * never as a failure to set. The expected family count comes from the tag
 * file, and the last line is "N/N families swept" or "N/M, run incomplete".
 *
 * Reach (gate 3b): the sweep proves that a name sets without an error and
 * with ink, at the weight the steps ask for (400, or the family's default).
 * It does not prove the result looks right: a font that sets the wrong
 * shapes without an error passes. It tests two Latin names; a name in
 * another script is not covered. Licenses are not read (the metadata
 * requests are answered locally), so the spec sheet's license line is not
 * covered either.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadFont, setText, type FetchLike } from "../../kit/src/font.ts";
import { bounds } from "../../kit/src/path.ts";
import { parseTags } from "../fonts.ts";

const TAGS_URL = "https://raw.githubusercontent.com/google/fonts/main/tags/all/families.csv";
/** The weight the wordmark step and the kit ask for. */
const WEIGHT = 400;
/** A plain name with a ligature in it, and one with accents. Reported separately. */
const NAMES = { plain: "Gala Office", accented: "Café Noël" } as const;
type NameKey = keyof typeof NAMES;

function option(name: string): string | null {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? (process.argv[at + 1] ?? null) : null;
}

const cacheArg = option("cache");
if (cacheArg === null) {
  console.error("font sweep: pass --cache <folder outside the repo>; the font files are kept there between runs");
  process.exit(2);
}
const cache = resolve(cacheArg);
mkdirSync(cache, { recursive: true });
const concurrency = Math.max(1, Number(option("concurrency") ?? 6));
const only = option("only")?.split(",").map((name) => name.trim()) ?? null;
const out = option("out");

type Fetched = { ok: boolean; status: number; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> };
const answer = (status: number, bytes: Uint8Array): Fetched => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => new TextDecoder().decode(bytes),
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
});

let downloaded = 0;
let fromCache = 0;

/** Fetches once and keeps the answer on disk. A network error or a 429/5xx is retried, then thrown. */
async function cachedFetch(url: string, headers?: Record<string, string>): Promise<Fetched> {
  const key = join(cache, createHash("sha1").update(`${headers?.["User-Agent"] ?? ""} ${url}`).digest("hex"));
  if (existsSync(`${key}.status`)) {
    fromCache++;
    return answer(Number(readFileSync(`${key}.status`, "utf8")), new Uint8Array(readFileSync(`${key}.body`)));
  }
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(120_000) });
      if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      // A definite answer (found, or "no such family") is kept; trouble is not.
      writeFileSync(`${key}.body`, bytes);
      writeFileSync(`${key}.status`, String(response.status));
      downloaded++;
      return answer(response.status, bytes);
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      await new Promise((done) => setTimeout(done, 1000 * attempt * attempt));
    }
  }
  throw new Error(`network: ${last}`);
}

/** `glyphs` is how many glyphs the name set in, when the setter says. */
type NameResult = { ok: true; glyphs: number | null } | { ok: false; cause: string; message: string };
type FamilyResult =
  | { family: string; state: "notDownloaded"; cause: string; message: string }
  | { family: string; state: "notParsed"; cause: string; message: string }
  | { family: string; state: "loaded"; color: boolean | null; axes: string[] | null; names: Record<NameKey, NameResult> };

/** The message with the particulars taken out, so one cause is one group. */
function causeOf(message: string, family: string): string {
  return message
    .split(family)
    .join("<family>")
    .replace(/has no glyph for .*/, "has no glyph for a letter in the name")
    .replace(/"[^"]*"/g, '"…"')
    .replace(/HTTP \d+/g, (status) => status)
    .trim();
}

async function sweepOne(family: string): Promise<FamilyResult> {
  // True once the font file itself arrived: anything that fails after that is the font, not the download.
  let fontArrived = false;
  const fetcher: FetchLike = async (url, init) => {
    // The sweep does not read licenses: the metadata lookups are answered here, not fetched.
    if (url.startsWith("https://raw.githubusercontent.com/")) return answer(404, new Uint8Array());
    const response = await cachedFetch(url, init?.headers);
    if (new URL(url).hostname === "fonts.gstatic.com" && response.ok) fontArrived = true;
    return response;
  };
  let font;
  try {
    font = await loadFont(family, WEIGHT, fetcher);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { family, state: fontArrived ? "notParsed" : "notDownloaded", cause: causeOf(message, family), message };
  }
  const names = {} as Record<NameKey, NameResult>;
  for (const key of Object.keys(NAMES) as NameKey[]) {
    try {
      const set = setText(font, NAMES[key], 1000);
      const box = bounds(set.segments);
      if (!(box.width > 0 && box.height > 0 && Number.isFinite(set.capHeight) && set.capHeight > 0)) throw new Error("the name set with no ink or no cap height");
      names[key] = { ok: true, glyphs: (set as { glyphs?: number[] }).glyphs?.length ?? null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      names[key] = { ok: false, cause: causeOf(message, family), message };
    }
  }
  // What the setter says about the file, when it says (the setter before HarfBuzz did not).
  const facts = font as { info: { color?: boolean }; axes?: string[] };
  return { family, state: "loaded", color: facts.info.color ?? null, axes: facts.axes ?? null, names };
}

const tags = await cachedFetch(TAGS_URL);
if (!tags.ok) {
  console.error(`font sweep: Google's tag file did not load (HTTP ${tags.status}); nothing was swept`);
  process.exit(1);
}
const catalog = parseTags(await tags.text()).families.map((entry) => entry.family);
const families = only === null ? catalog : catalog.filter((family) => only.includes(family));
const expected = families.length;
console.log(`font sweep: ${expected} families${only === null ? "" : ` (of ${catalog.length}, --only)`}, weight ${WEIGHT}, names ${Object.values(NAMES).map((name) => JSON.stringify(name)).join(" and ")}`);

/**
 * opentype.js 2.0 can reject a promise nobody holds (an SVG-in-OpenType
 * glyph, on Node). In the server that ends the whole process, not one turn,
 * so the sweep records it as its own cause instead of dying with it.
 */
let stray: string | null = null;
process.on("unhandledRejection", (reason) => {
  stray = reason instanceof Error ? reason.message : String(reason);
});
const settle = () => new Promise<void>((done) => setImmediate(done));

/** Fills the cache, several families at a time. Only a head start: the pass below fetches whatever this missed. */
async function warm(family: string): Promise<void> {
  const headers = { "User-Agent": "Mozilla/4.0" };
  const name = family.trim().replace(/ +/g, "+");
  let css = await cachedFetch(`https://fonts.googleapis.com/css2?family=${name}:wght@${WEIGHT}`, headers);
  if (!css.ok) css = await cachedFetch(`https://fonts.googleapis.com/css2?family=${name}`, headers);
  const url = css.ok ? (await css.text()).match(/src:\s*url\(([^)]+)\)/)?.[1] : undefined;
  if (url !== undefined && url.startsWith("https://fonts.gstatic.com/")) await cachedFetch(url);
}
let next = 0;
const started = Date.now();
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < families.length) await warm(families[next++]!).catch(() => undefined);
  }),
);
console.log(`  font files ready (${Math.round((Date.now() - started) / 1000)}s)`);

// One family at a time, so a stray rejection is charged to the family that caused it.
const results: FamilyResult[] = [];
for (const family of families) {
  try {
    stray = null;
    let result = await sweepOne(family);
    await settle();
    await settle();
    if (stray !== null) {
      const message = `ends the server process (a rejected promise nobody holds): ${stray}`;
      result = result.state === "loaded" ? { ...result, names: { plain: { ok: false, cause: message, message }, accented: { ok: false, cause: message, message } } } : result;
    }
    results.push(result);
  } catch (error) {
    // sweepOne catches what the font does; this is the sweep itself failing, and the family stays unswept.
    console.error(`font sweep: could not sweep ${family}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (results.length % 500 === 0) console.log(`  ${results.length}/${expected} (${Math.round((Date.now() - started) / 1000)}s)`);
}
results.sort((a, b) => a.family.localeCompare(b.family));

function grouped(entries: { family: string; cause: string }[]): { cause: string; count: number; families: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const entry of entries) groups.set(entry.cause, [...(groups.get(entry.cause) ?? []), entry.family]);
  return [...groups.entries()].map(([cause, list]) => ({ cause, count: list.length, families: list })).sort((a, b) => b.count - a.count || a.cause.localeCompare(b.cause));
}
const sample = (list: string[]) => `${list.slice(0, 6).join(", ")}${list.length > 6 ? `, and ${list.length - 6} more` : ""}`;

const notDownloaded = results.filter((result) => result.state === "notDownloaded");
const notParsed = results.filter((result) => result.state === "notParsed");
const loaded = results.filter((result) => result.state === "loaded");

const report: Record<string, unknown> = {
  ranAt: new Date().toISOString(),
  expected,
  swept: results.length,
  weight: WEIGHT,
  notDownloaded: grouped(notDownloaded),
  notParsed: grouped(notParsed),
  names: {},
};

console.log(`\nfont files: ${downloaded} requests downloaded, ${fromCache} read from the cache`);
console.log(`not downloaded (a result about the download, not the font): ${notDownloaded.length}`);
for (const group of grouped(notDownloaded)) console.log(`  ${group.count}  ${group.cause}\n        ${sample(group.families)}`);
console.log(`downloaded but not read as a font: ${notParsed.length}`);
for (const group of grouped(notParsed)) console.log(`  ${group.count}  ${group.cause}\n        ${sample(group.families)}`);

let consistent = true;
for (const key of Object.keys(NAMES) as NameKey[]) {
  const set = loaded.filter((result) => result.names[key].ok);
  const failed = loaded.flatMap((result) => {
    const name = result.names[key];
    return name.ok ? [] : [{ family: result.family, cause: name.cause }];
  });
  const groups = grouped(failed);
  // Every swept family is in exactly one of the four counts.
  if (set.length + failed.length + notParsed.length + notDownloaded.length !== results.length) consistent = false;
  (report.names as Record<string, unknown>)[key] = { name: NAMES[key], set: set.length, failed: failed.length, notParsed: notParsed.length, notDownloaded: notDownloaded.length, causes: groups };
  console.log(`\n${JSON.stringify(NAMES[key])}: ${set.length} set, ${failed.length + notParsed.length} failed (${failed.length} while setting, ${notParsed.length} not read as a font), ${notDownloaded.length} not downloaded`);
  for (const group of groups) console.log(`  ${group.count}  ${group.cause}\n        ${sample(group.families)}`);
  // Set in fewer glyphs than letters: the font joined letters, so its ligatures were applied.
  const letters = [...NAMES[key]].length;
  const measured = set.filter((result) => (result.names[key] as { glyphs: number | null }).glyphs !== null);
  const joined = measured.filter((result) => (result.names[key] as { glyphs: number }).glyphs < letters).map((result) => result.family);
  console.log(measured.length === 0 ? "  glyph counts: not measured (this setter does not report them)" : `  set in fewer glyphs than letters (ligatures applied): ${joined.length} of ${measured.length}\n        ${sample(joined)}`);
  (report.names as Record<string, Record<string, unknown>>)[key]!.joined = joined;
}

// Facts about the files that set, for the classes the sweep cannot fail on its own.
const colorFonts = loaded.filter((result) => result.color === true).map((result) => result.family);
const variableFonts = loaded.filter((result) => (result.axes?.length ?? 0) > 0).map((result) => result.family);
if (loaded.some((result) => result.color !== null)) {
  console.log(`\ncolor typefaces among the files read (drawn as plain outlines in one color): ${colorFonts.length}\n        ${colorFonts.join(", ")}`);
  console.log(`files with variation axes (Google serves a static instance for a weight, so this should be 0): ${variableFonts.length}${variableFonts.length > 0 ? `\n        ${sample(variableFonts)}` : ""}`);
  report.colorFonts = colorFonts;
  report.variableFonts = variableFonts;
}

if (out !== null) {
  writeFileSync(resolve(out), JSON.stringify({ ...report, families: results }, null, 1));
  console.log(`\nreport written to ${resolve(out)}`);
}

if (results.length !== expected || !consistent) {
  console.log(`\n${results.length}/${expected}, run incomplete`);
  process.exitCode = 1;
} else {
  console.log(`\n${results.length}/${expected} families swept`);
}
