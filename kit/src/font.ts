/**
 * Sets the wordmark in a Google Fonts family and converts it to outlines, so
 * no file in the kit depends on an installed font and no font file ships.
 *
 * The font comes from the Google Fonts CSS API as TrueType. Asking for a
 * weight returns a static instance even for variable families. The license
 * and category are read from the family's METADATA.pb in the google/fonts
 * repository. Only those two hosts and fonts.gstatic.com are ever fetched;
 * a font URL on any other host is refused.
 *
 * The name is shaped by HarfBuzz (harfbuzzjs), the engine Chrome, Firefox
 * and Android shape with, so kerning, ligatures, contextual forms and mark
 * placement come from the font, as the browser shows them on the type card.
 * HarfBuzz does not read WOFF, which is why the fetch asks for TrueType.
 *
 * Reach (gate 3b):
 * - A character the font has no glyph for fails loudly, as does a letter
 *   that would draw with no outline. Nothing is swapped for another font.
 * - When a font's own ligature points at a glyph it lacks, the name is set
 *   without the optional ligatures instead of failing. That is the one
 *   place the setter steps down, and it draws only the font's own letters.
 * - A family with no Regular is set in the weight a browser would pick for
 *   it; `info.weight` is the weight actually drawn.
 * - The whole name is shaped as one run, in the script and direction of its
 *   first letters. A name in one script sets correctly, right-to-left
 *   included. A name that mixes scripts (Latin with Arabic, say) is not
 *   split into runs, so its second script would set without its own rules.
 * - A color typeface is drawn as its plain outlines in one color: the kit
 *   fills the wordmark with one color. `info.color` says so.
 * - With letter spacing other than 0, the optional ligatures (liga, clig)
 *   are turned off, as CSS asks of a browser, so the outlines match the
 *   wordmark card.
 */

import * as hb from "harfbuzzjs";
import { bounds, parsePath, type Point, type Segment } from "./path.ts";

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }>;

export type FontInfo = {
  family: string;
  weight: number;
  category: string | null;
  license: "OFL" | "Apache-2.0" | "UFL" | null;
  licenseName: string | null;
  /** True when the typeface carries color glyphs (COLR, SVG or bitmap). The kit draws its plain outlines in one color. */
  color: boolean;
};

/**
 * This typeface cannot draw this name, and asking again will not change
 * that: the family is not on Google Fonts, its file cannot be read, or it
 * lacks a letter. Anything else that goes wrong (the network, Google
 * answering with an error) is thrown as a plain Error.
 */
export class CannotSet extends Error {
  readonly family: string;
  readonly why: "notOnGoogle" | "unreadable" | "missingLetters" | "noOutline" | "color";
  /** The letters the typeface cannot draw, when that is the reason. */
  readonly letters: string[];
  constructor(family: string, why: CannotSet["why"], message: string, letters: string[] = []) {
    super(message);
    this.name = "CannotSet";
    this.family = family;
    this.why = why;
    this.letters = letters;
  }
}

export type LoadedFont = {
  info: FontInfo;
  font: hb.Font;
  unitsPerEm: number;
  /** Cap height in font units. */
  capHeight: number;
  /** The variation axes of the file, by tag. Empty for a static instance, which is what Google serves for a weight. */
  axes: string[];
  /** Each glyph's outline in font units, y up, read once. */
  outlines: Map<number, Segment[]>;
};

const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 ]{0,63}$/;
const FONT_HOST = "fonts.gstatic.com";
// An old user agent makes the CSS API answer with TrueType rather than WOFF2.
const TTF_USER_AGENT = "Mozilla/4.0";

const LICENSES: Record<string, { id: FontInfo["license"]; name: string }> = {
  OFL: { id: "OFL", name: "SIL Open Font License" },
  APACHE2: { id: "Apache-2.0", name: "Apache License 2.0" },
  UFL: { id: "UFL", name: "Ubuntu Font Licence" },
};

const CATEGORIES: Record<string, string> = {
  SERIF: "Serif",
  SANS_SERIF: "Sans serif",
  DISPLAY: "Display",
  HANDWRITING: "Handwriting",
  MONOSPACE: "Monospace",
};

function cssUrl(family: string, weight?: number): string {
  const name = family.trim().replace(/ +/g, "+");
  return `https://fonts.googleapis.com/css2?family=${name}${weight === undefined ? "" : `:wght@${weight}`}`;
}

async function fetchMetadata(family: string, fetcher: FetchLike): Promise<Pick<FontInfo, "category" | "license" | "licenseName">> {
  const slug = family.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const dir of ["ofl", "apache", "ufl"]) {
    try {
      const res = await fetcher(`https://raw.githubusercontent.com/google/fonts/main/${dir}/${slug}/METADATA.pb`);
      if (!res.ok) continue;
      const text = await res.text();
      const lic = LICENSES[text.match(/^license:\s*"(\w+)"/m)?.[1] ?? ""];
      const cat = text.match(/^category:\s*"(\w+)"/m)?.[1];
      return { license: lic?.id ?? null, licenseName: lic?.name ?? null, category: cat ? (CATEGORIES[cat] ?? cat) : null };
    } catch {
      // Metadata is for the spec sheet only; a miss must not stop the kit.
    }
  }
  return { license: null, licenseName: null, category: null };
}

/** Every weight, upright and italic, for the older CSS API, which answers with the styles a family has and skips the rest. */
const EVERY_STYLE = [100, 200, 300, 400, 500, 600, 700, 800, 900].flatMap((weight) => [`${weight}`, `${weight}i`]).join(",");

type Face = { url: string; weight: number; italic: boolean };

function facesIn(css: string): Face[] {
  return [...css.matchAll(/@font-face\s*{([^}]*)}/g)].flatMap((block) => {
    const url = block[1]!.match(/src:\s*url\(([^)]+)\)\s*format\(['"]truetype['"]\)/)?.[1];
    const weight = Number(block[1]!.match(/font-weight:\s*(\d+)/)?.[1]);
    return url === undefined || !Number.isFinite(weight) ? [] : [{ url, weight, italic: /font-style:\s*italic/.test(block[1]!) }];
  });
}

/**
 * The face a browser would use for `weight` when the family has no such
 * weight (CSS font matching): upright before italic; for 400 try 500 first
 * and for 500 try 400; then, at 500 and under, lighter before heavier, and
 * above 500 heavier before lighter.
 */
function nearestFace(faces: Face[], weight: number): Face | undefined {
  const pool = faces.some((face) => !face.italic) ? faces.filter((face) => !face.italic) : faces;
  const lighter = pool.filter((face) => face.weight < weight).sort((a, b) => b.weight - a.weight);
  const heavier = pool.filter((face) => face.weight > weight).sort((a, b) => a.weight - b.weight);
  const exact = pool.find((face) => face.weight === weight);
  const neighbor = weight === 400 ? pool.find((face) => face.weight === 500) : weight === 500 ? pool.find((face) => face.weight === 400) : undefined;
  return exact ?? neighbor ?? (weight <= 500 ? [...lighter, ...heavier] : [...heavier, ...lighter])[0];
}

export async function loadFont(family: string, weight: number, fetcher: FetchLike): Promise<LoadedFont> {
  if (!FAMILY.test(family.trim())) throw new CannotSet(family, "notOnGoogle", `kit: "${family}" is not a Google Fonts family name`);
  if (!Number.isInteger(weight) || weight < 100 || weight > 900) throw new Error(`kit: font weight ${weight} is out of range`);
  const headers = { "User-Agent": TTF_USER_AGENT };
  let res = await fetcher(cssUrl(family, weight), { headers });
  // The family has no such weight (Buda is Light only, Molle italic only): ask for every style and take the one a browser would.
  if (!res.ok) res = await fetcher(`https://fonts.googleapis.com/css?family=${family.trim().replace(/ +/g, "+")}:${EVERY_STYLE}`, { headers });
  // 400 and 404 are Google saying there is no such family; any other status is trouble on the way, not an answer.
  if (!res.ok && (res.status === 400 || res.status === 404)) throw new CannotSet(family, "notOnGoogle", `kit: Google Fonts has no family "${family}" (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`kit: Google Fonts did not answer for "${family}" (HTTP ${res.status})`);
  const face = nearestFace(facesIn(await res.text()), weight);
  if (face === undefined) throw new CannotSet(family, "unreadable", `kit: no TrueType source for "${family}"`);
  const url = new URL(face.url);
  if (url.protocol !== "https:" || url.hostname !== FONT_HOST) throw new Error(`kit: refusing a font from ${url.hostname}`);
  const servedWeight = face.weight;
  const fontRes = await fetcher(url.toString());
  if (!fontRes.ok) throw new Error(`kit: font download failed (HTTP ${fontRes.status})`);
  const bytes = new Uint8Array(await fontRes.arrayBuffer());
  const hbFace = new hb.Face(new hb.Blob(bytes));
  // HarfBuzz hands back an empty face for bytes it cannot read, where a parser would throw.
  if (!(hbFace.upem > 0) || hbFace.collectUnicodes().length === 0) throw new CannotSet(family, "unreadable", `kit: the file for "${family}" is not a font HarfBuzz can read`);
  const font = new hb.Font(hbFace);
  const color = hbFace.hasColorLayers() || hbFace.hasColorPaint() || hbFace.hasColorPng() || hbFace.referenceTable("SVG ") !== undefined;
  const meta = await fetchMetadata(family, fetcher);
  return { info: { family: family.trim(), weight: servedWeight, ...meta, color }, font, unitsPerEm: hbFace.upem, capHeight: capHeightOf(font, hbFace.upem), axes: Object.keys(hbFace.getAxisInfos()), outlines: new Map() };
}

/** The cap height the font states, else the height of its H, else 0.7 em. */
function capHeightOf(font: hb.Font, unitsPerEm: number): number {
  const stated = font.getMetricPosition(hb.MetricsTag.CAP_HEIGHT);
  if (stated !== undefined && stated > 0) return stated;
  const h = font.nominalGlyph("H".codePointAt(0)!);
  const top = h === undefined ? undefined : font.glyphExtents(h)?.yBearing;
  return top !== undefined && top > 0 ? top : unitsPerEm * 0.7;
}

function outlineOf(loaded: LoadedFont, glyph: number): Segment[] {
  let outline = loaded.outlines.get(glyph);
  if (outline === undefined) {
    // HarfBuzz writes M, L, Q, C and Z in font units; parsePath raises Q to C and throws on anything else.
    outline = parsePath(loaded.font.glyphToPath(glyph));
    loaded.outlines.set(glyph, outline);
  }
  return outline;
}

export type SetText = {
  segments: Segment[];
  /** Cap height in the same units as `segments`, for optical centering. */
  capHeight: number;
  /** The glyphs the name was set in, by the font's glyph ids, in drawing order. Fewer than its letters when the font joined some into ligatures. */
  glyphs: number[];
  /** Where the last line's baseline is, below the first's at y = 0. 0 for a name on one line. */
  lastBaseline: number;
  /** How many lines the name is set on. */
  lines: number;
};

/** The optional ligatures, off: what a browser does when letter spacing is not 0. */
const NO_OPTIONAL_LIGATURES = [new hb.Feature("liga", 0), new hb.Feature("clig", 0)];

/** Spaces, and the characters Unicode marks as invisible by default (joiners, soft hyphens, variation selectors). */
const INVISIBLE = /[\p{White_Space}\p{Default_Ignorable_Code_Point}]/gu;

/**
 * Sets `text` with its baseline at y = 0 at `fontSize` units, as outlines.
 * `letterSpacing` is added after every letter, in ems (0 sets the type as
 * the typeface draws it).
 */
export function setText(loaded: LoadedFont, text: string, fontSize: number, letterSpacing = 0): SetText {
  const shape = (features: hb.Feature[] | undefined) => {
    const buffer = new hb.Buffer();
    buffer.addText(text);
    buffer.guessSegmentProperties();
    hb.shape(loaded.font, buffer, features);
    return { infos: buffer.getGlyphInfos(), positions: buffer.getGlyphPositions() };
  };
  let shaped = shape(letterSpacing !== 0 ? NO_OPTIONAL_LIGATURES : undefined);
  // Glyph 0 is the font's "missing" box. When the font has every letter and still set one, a ligature
  // of its own points at a glyph it lacks (Doppio One's "ffi"): the name is set again without the
  // optional ligatures, letter by letter, which is what the font can draw.
  const hasEveryLetter = [...text].every((letter) => (loaded.font.nominalGlyph(letter.codePointAt(0)!) ?? 0) !== 0);
  if (letterSpacing === 0 && hasEveryLetter && shaped.infos.some((info) => info.codepoint === 0)) shaped = shape(NO_OPTIONAL_LIGATURES);
  const { infos, positions } = shaped;

  // A cluster is the stretch of the name one or more glyphs stand for; `cluster` is where it starts.
  const starts = [...new Set(infos.map((info) => info.cluster))].sort((a, b) => a - b);
  const lettersOf = (cluster: number): string => text.slice(cluster, starts[starts.indexOf(cluster) + 1] ?? text.length);
  /** True when the letters are meant to draw something: not spaces, and not marks Unicode says to leave invisible. */
  const draws = (letters: string): boolean => letters.replace(INVISIBLE, "") !== "";

  const missing = [...new Set(infos.filter((info) => info.codepoint === 0).map((info) => lettersOf(info.cluster)))].filter(draws);
  if (missing.length > 0) throw new CannotSet(loaded.info.family, "missingLetters", `kit: ${loaded.info.family} has no glyph for ${missing.map((letters) => JSON.stringify(letters)).join(", ")}`, missing);

  const scale = fontSize / loaded.unitsPerEm;
  const segments: Segment[] = [];
  const inked = new Set<number>();
  let penX = 0;
  let penY = 0;
  infos.forEach((info, index) => {
    const position = positions[index]!;
    const dx = (penX + position.xOffset) * scale;
    const dy = (penY + position.yOffset) * scale;
    // Font units have y up; the kit draws with y down and the baseline at 0.
    const place = (p: Point): Point => ({ x: p.x * scale + dx, y: -(p.y * scale + dy) });
    const outline = outlineOf(loaded, info.codepoint);
    if (outline.length > 0) inked.add(info.cluster);
    for (const segment of outline) {
      if (segment.op === "M" || segment.op === "L") segments.push({ op: segment.op, p: place(segment.p) });
      else if (segment.op === "C") segments.push({ op: "C", c1: place(segment.c1), c2: place(segment.c2), p: place(segment.p) });
      else segments.push(segment);
    }
    penX += position.xAdvance;
    penY += position.yAdvance;
    // Letter spacing follows each letter, not each glyph: a mark placed on its base adds none of its own.
    if (infos[index + 1]?.cluster !== info.cluster) penX += letterSpacing * loaded.unitsPerEm;
  });

  // A letter whose glyphs have no outline at all (a bitmap-only font) would vanish from the wordmark.
  const blank = starts.filter((cluster) => !inked.has(cluster) && draws(lettersOf(cluster))).map(lettersOf);
  if (blank.length > 0 && inked.size > 0) throw new CannotSet(loaded.info.family, "noOutline", `kit: ${loaded.info.family} has no outline for ${blank.map((letters) => JSON.stringify(letters)).join(", ")}`, blank);
  if (segments.length === 0) throw new CannotSet(loaded.info.family, "noOutline", "kit: the wordmark has no visible glyphs");
  for (const segment of segments) {
    for (const point of segment.op === "Z" ? [] : segment.op === "C" ? [segment.c1, segment.c2, segment.p] : [segment.p]) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error("kit: the font produced a non-finite coordinate");
    }
  }
  return { segments, capHeight: (loaded.capHeight / loaded.unitsPerEm) * fontSize, glyphs: infos.map((info) => info.codepoint), lastBaseline: 0, lines: 1 };
}

/**
 * The typeface's own distance from one baseline to the next, in ems:
 * ascender minus descender plus line gap, as HarfBuzz reads them from the
 * font (its typo metrics when the font asks for them, else hhea). That is
 * the line height a browser draws for `line-height: normal`, which is how
 * the wordmark and lockup cards set the name, so a name on two lines sits
 * the same in the files as on the cards. Nothing here is tuned to a name.
 */
export function lineAdvanceEm(loaded: LoadedFont): number {
  const { ascender, descender, lineGap } = loaded.font.hExtents();
  const advance = (ascender - descender + Math.max(lineGap, 0)) / loaded.unitsPerEm;
  // A font with no usable vertical metrics: 1.2 em, the common default line height of type.
  return Number.isFinite(advance) && advance > 0 ? advance : 1.2;
}

export type Align = "center" | "left";

/**
 * Sets the name on one or more lines, as outlines. One line is `setText`
 * exactly. With more, each line is set on its own, aligned on its ink
 * (centered on x = 0, or with its left edge at x = 0), and each baseline
 * sits one line advance (`lineAdvanceEm`) below the last. The first line's
 * baseline is at y = 0, and `lastBaseline` says where the last one is, so
 * a layout can center or hang the whole block.
 *
 * The guard's threshold is zero: a line moves down only when its ink would
 * reach into the line above, and then only until the two inks touch. Zero,
 * not a margin, because any margin would be a number tuned by eye; the
 * typeface's own advance is the spacing, and the guard exists only so a
 * font that states metrics too small for its own letters (a display face
 * with tall swashes, say) can never draw one line over another.
 *
 * Reach (gate 3b): the guard keeps the lines apart, it does not make the
 * spacing pleasing. Lines are aligned on their ink, not their advance, so a
 * letter's side bearing never shifts a line off center.
 */
export function setLines(loaded: LoadedFont, lines: string[], fontSize: number, letterSpacing = 0, align: Align = "center"): SetText {
  if (lines.length <= 1) return setText(loaded, lines[0] ?? "", fontSize, letterSpacing);
  const advance = lineAdvanceEm(loaded) * fontSize;
  const segments: Segment[] = [];
  const glyphs: number[] = [];
  let baseline = 0;
  let inkBottom = -Infinity;
  lines.forEach((line, index) => {
    const set = setText(loaded, line, fontSize, letterSpacing);
    const box = bounds(set.segments);
    if (index > 0) baseline = Math.max(baseline + advance, inkBottom - box.y);
    const dx = align === "center" ? -(box.x + box.width / 2) : -box.x;
    for (const segment of set.segments) segments.push(moved(segment, dx, baseline));
    glyphs.push(...set.glyphs);
    inkBottom = baseline + box.y + box.height;
  });
  return { segments, capHeight: (loaded.capHeight / loaded.unitsPerEm) * fontSize, glyphs, lastBaseline: baseline, lines: lines.length };
}

function moved(segment: Segment, dx: number, dy: number): Segment {
  const at = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  if (segment.op === "M" || segment.op === "L") return { op: segment.op, p: at(segment.p) };
  if (segment.op === "C") return { op: "C", c1: at(segment.c1), c2: at(segment.c2), p: at(segment.p) };
  return segment;
}
