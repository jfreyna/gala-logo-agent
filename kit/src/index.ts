/**
 * buildKit: the chosen mark, a Google font and the picked colors in; the
 * lock-up kit and its spec sheet out (FRI-1705, phase 5).
 *
 * Files: primary, stacked, icon and wordmark, each in color, all black and
 * all white, each as SVG, EPS and PNG (36), plus the square and the social
 * image (PNG). FRI-1730: when the colorway's ground is a brand color, each
 * lock-up also comes on that ground ("ground", SVG, EPS and PNG); when the
 * colorway paints a lock-up the same as the all-black or all-white set, its
 * "color" files are left out and that set stands in (`spec.colorway.files`). Paths group by the kit card's chips: svg/, eps/, png/,
 * square/, social/. The caller (the engine) stores them; this module writes
 * nothing to disk and holds no state.
 */

import type { Role } from "./color.ts";
import { normalizeHex } from "./color.ts";
import { loadFont, setLines, type FetchLike } from "./font.ts";
import { iconArtwork, primaryLockup, socialArtwork, squareArtwork, stackedLockup, wordmarkArtwork, type Artwork } from "./layout.ts";
import { PNG_LONG_EDGE, naturalSize, toEps, toPng, toSvg, type Fills } from "./render.ts";
import { colorwayVariant, onGround } from "./ground.ts";
import { buildSpec, CLEAR_SPACE_RATIO, isBrandGround, resolve, type Colors, type Colorway, type SpecColorway, type SpecSheet } from "./spec.ts";
import { traceMark } from "./trace.ts";

export type { Role } from "./color.ts";
export type { Colors, Colorway, ColorUse, SpecSheet, SpecColor, SpecColorway, SpecPair } from "./spec.ts";
export type { Contrast, LadderEntry, LadderStep } from "./color.ts";

export type KitInput = {
  /**
   * The chosen black-and-white mark. The format is read from the bytes;
   * `mime` is a hint. Leave it out for a logo of the name alone: the kit
   * then holds the wordmark only, and the square and the social image show
   * the name.
   */
  mark?: { bytes: Uint8Array; mime: "image/png" | "image/jpeg" | "image/svg+xml" };
  /** The wordmark text, e.g. "Ember & Rye". */
  name: string;
  /** For a name on two lines: how many of its words go on the first line, the rest on the second. Leave it out for one line. */
  breakAfter?: number;
  /** A Google Fonts family. */
  fontFamily: string;
  /** Default 400; a family without that weight falls back to its default. */
  fontWeight?: number;
  /** Added after every letter of the name, in ems. Default 0: the name as the typeface draws it. */
  letterSpacing?: number;
  /** Multiplies the space between the mark and the name in both lock-ups. Default 1: the standard gap. */
  gapScale?: number;
  /** The lock-up the person will use most, shown on the social image. Default "primary" (side by side). */
  layout?: "primary" | "stacked";
  /** #rrggbb. */
  colors: Colors;
  /** The chosen colorway: which color fills the mark and the wordmark, and the ground of the square and the social image (default: the neutral light gray). */
  colorway: Colorway;
};

export type Lockup = "primary" | "stacked" | "icon" | "wordmark" | "square" | "social";
/** "ground": the lock-up in the colorway's fills on its brand-color ground (FRI-1730). */
export type Variant = "color" | "black" | "white" | "ground";
export type Format = "svg" | "eps" | "png";

export type KitFile = {
  path: string;
  mime: "image/svg+xml" | "application/postscript" | "image/png";
  bytes: Uint8Array;
  lockup: Lockup;
  variant: Variant;
  format: Format;
  /** px for PNG and SVG, pt for EPS. */
  width: number;
  height: number;
};

export type KitResult = { files: KitFile[]; spec: SpecSheet };

export type KitOptions = {
  /** Injected for tests; defaults to the global fetch. Only Google Fonts hosts are called. */
  fetch?: FetchLike;
};

const LABELS: Record<Lockup, string> = {
  primary: "primary lock-up",
  stacked: "stacked lock-up",
  icon: "icon",
  wordmark: "wordmark",
  square: "square",
  social: "social image",
};
const VARIANT_LABELS: Record<Variant, string> = { color: "color", black: "all black", white: "all white", ground: "on the ground" };

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "logo";
}

/** The words of a name: what it breaks between when it is set on two lines. */
export function wordsOf(name: string): string[] {
  return name.trim().split(/\s+/).filter((word) => word !== "");
}

/** The name's lines: the whole name, or its words split after `breakAfter` of them. */
export function nameLines(name: string, breakAfter?: number): string[] {
  const words = wordsOf(name);
  if (breakAfter === undefined || breakAfter < 1 || breakAfter >= words.length) return [name.trim()];
  return [words.slice(0, breakAfter).join(" "), words.slice(breakAfter).join(" ")];
}

function validate(input: KitInput): void {
  if (typeof input.name !== "string" || input.name.trim() === "") throw new Error("kit: the name is empty");
  if (input.name.length > 60) throw new Error("kit: the name is longer than 60 characters");
  if (input.letterSpacing !== undefined && !(Number.isFinite(input.letterSpacing) && Math.abs(input.letterSpacing) <= 0.5)) throw new Error("kit: letterSpacing must be between -0.5 and 0.5 em");
  if (input.gapScale !== undefined && !(Number.isFinite(input.gapScale) && input.gapScale > 0 && input.gapScale <= 4)) throw new Error("kit: gapScale must be above 0 and at most 4");
  if (input.layout !== undefined && input.layout !== "primary" && input.layout !== "stacked") throw new Error("kit: layout must be primary or stacked");
  if (input.breakAfter !== undefined && !(Number.isInteger(input.breakAfter) && input.breakAfter >= 1 && input.breakAfter < wordsOf(input.name).length)) throw new Error("kit: breakAfter must leave at least one word on each line");
  normalizeHex(input.colors.primary);
  normalizeHex(input.colors.secondary);
  if (input.colors.tertiary !== undefined) normalizeHex(input.colors.tertiary);
  const roles: Role[] = ["primary", "secondary", "tertiary"];
  for (const key of ["mark", "wordmark"] as const) {
    if (!roles.includes(input.colorway[key])) throw new Error(`kit: colorway.${key} must be primary, secondary or tertiary`);
  }
  const ground = input.colorway.ground;
  if (ground !== undefined && ground !== "white" && ground !== "neutral" && !roles.includes(ground)) throw new Error("kit: colorway.ground must be neutral, white or a role");
}

export async function buildKit(input: KitInput, options: KitOptions = {}): Promise<KitResult> {
  validate(input);
  const fetcher = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const name = input.name.trim();
  const [mark, font] = await Promise.all([input.mark === undefined ? null : traceMark(input.mark.bytes), loadFont(input.fontFamily, input.fontWeight ?? 400, fetcher)]);
  const setType = (fontSize: number, align?: "center" | "left") => setLines(font, nameLines(name, input.breakAfter), fontSize, input.letterSpacing ?? 0, align);
  const gapScale = input.gapScale ?? 1;

  // With no mark the kit is the wordmark alone.
  const art: Partial<Record<"primary" | "stacked" | "icon" | "wordmark", Artwork>> & { wordmark: Artwork } =
    mark === null
      ? { wordmark: wordmarkArtwork(setType) }
      : { primary: primaryLockup(mark, setType, gapScale), stacked: stackedLockup(mark, setType, gapScale), icon: iconArtwork(mark), wordmark: wordmarkArtwork(setType) };

  const markColor = resolve(input.colors, input.colorway.mark);
  const wordColor = resolve(input.colors, input.colorway.wordmark);
  const groundColor = resolve(input.colors, input.colorway.ground ?? "neutral");
  const fills: Record<Variant, Fills> = {
    color: { mark: markColor, wordmark: wordColor },
    black: { mark: "#000000", wordmark: "#000000" },
    white: { mark: "#FFFFFF", wordmark: "#FFFFFF" },
    ground: { mark: markColor, wordmark: wordColor, ground: groundColor },
  };
  // FRI-1730: on-ground files only on a brand-color ground; a white or neutral colorway keeps today's set.
  const brandGround = isBrandGround(input.colorway.ground);
  const colorwayFiles: SpecColorway["files"] = {};

  const slug = slugify(name);
  const encoder = new TextEncoder();
  const files: KitFile[] = [];
  const title = (lockup: Lockup, variant: Variant) => `${name}, ${LABELS[lockup]}, ${VARIANT_LABELS[variant]}`;

  for (const lockup of ["primary", "stacked", "icon", "wordmark"] as const) {
    const flat = art[lockup];
    if (flat === undefined) continue;
    // FRI-1730: no "color" copy of the all-black (or all-white) files; the on-ground files when the ground is a brand color.
    const holder = colorwayVariant(flat, fills);
    colorwayFiles[lockup] = holder;
    const variants: Variant[] = [...(holder === "color" ? (["color"] as const) : []), "black", "white", ...(brandGround ? (["ground"] as const) : [])];
    for (const variant of variants) {
      const a = variant === "ground" ? onGround(flat, CLEAR_SPACE_RATIO) : flat;
      const base = `${slug}-${lockup}-${variant}`;
      const svg = toSvg(a, fills[variant], title(lockup, variant));
      const svgSize = naturalSize(a);
      files.push({ path: `svg/${base}.svg`, mime: "image/svg+xml", bytes: encoder.encode(svg), lockup, variant, format: "svg", ...svgSize });
      const eps = toEps(a, fills[variant], title(lockup, variant));
      files.push({ path: `eps/${base}.eps`, mime: "application/postscript", bytes: encoder.encode(eps.text), lockup, variant, format: "eps", width: eps.width, height: eps.height });
      const png = toPng(svg, a, PNG_LONG_EDGE);
      files.push({ path: `png/${base}.png`, mime: "image/png", bytes: png.bytes, lockup, variant, format: "png", width: png.width, height: png.height });
    }
  }

  // The square shows the icon and the social image the lock-up the person uses most; with no mark, both show the name.
  const canvases = { square: squareArtwork(art.icon ?? art.wordmark), social: socialArtwork((input.layout === "stacked" ? art.stacked : art.primary) ?? art.wordmark) };
  for (const lockup of ["square", "social"] as const) {
    const a = canvases[lockup];
    const svg = toSvg(a, fills.ground, title(lockup, "color"), { width: a.width, height: a.height });
    const png = toPng(svg, a);
    files.push({ path: `${lockup}/${slug}-${lockup}.png`, mime: "image/png", bytes: png.bytes, lockup, variant: "color", format: "png", width: png.width, height: png.height });
  }

  return { files, spec: buildSpec(name, input.colors, input.colorway, font.info, { nameOnly: mark === null, files: colorwayFiles }) };
}
