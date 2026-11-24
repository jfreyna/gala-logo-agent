/**
 * buildKit: the chosen mark, a Google font and the picked colors in; the
 * lock-up kit and its spec sheet out (FRI-1705, phase 5).
 *
 * Files: primary, stacked, icon and wordmark, each in color, all black and
 * all white, each as SVG, EPS and PNG (36), plus the square and the social
 * image (PNG). Paths group by the kit card's chips: svg/, eps/, png/,
 * square/, social/. The caller (the engine) stores them; this module writes
 * nothing to disk and holds no state.
 */

import type { Role } from "./color.ts";
import { normalizeHex } from "./color.ts";
import { loadFont, setText, type FetchLike } from "./font.ts";
import { iconArtwork, primaryLockup, socialArtwork, squareArtwork, stackedLockup, wordmarkArtwork, type Artwork } from "./layout.ts";
import { PNG_LONG_EDGE, naturalSize, toEps, toPng, toSvg, type Fills } from "./render.ts";
import { buildSpec, resolve, type Colors, type Colorway, type SpecSheet } from "./spec.ts";
import { traceMark } from "./trace.ts";

export type { Role } from "./color.ts";
export type { Colors, Colorway, SpecSheet, SpecColor, SpecPair } from "./spec.ts";
export type { Contrast, LadderEntry, LadderStep } from "./color.ts";

export type KitInput = {
  /** The chosen black-and-white mark. The format is read from the bytes; `mime` is a hint. */
  mark: { bytes: Uint8Array; mime: "image/png" | "image/jpeg" | "image/svg+xml" };
  /** The wordmark text, e.g. "Ember & Rye". */
  name: string;
  /** A Google Fonts family. */
  fontFamily: string;
  /** Default 400; a family without that weight falls back to its default. */
  fontWeight?: number;
  /** #rrggbb. */
  colors: Colors;
  /** The chosen colorway: which color fills the mark and the wordmark, and the square and social ground (default white). */
  colorway: Colorway;
};

export type Lockup = "primary" | "stacked" | "icon" | "wordmark" | "square" | "social";
export type Variant = "color" | "black" | "white";
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
const VARIANT_LABELS: Record<Variant, string> = { color: "color", black: "all black", white: "all white" };

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

function validate(input: KitInput): void {
  if (typeof input.name !== "string" || input.name.trim() === "") throw new Error("kit: the name is empty");
  if (input.name.length > 60) throw new Error("kit: the name is longer than 60 characters");
  normalizeHex(input.colors.primary);
  normalizeHex(input.colors.secondary);
  if (input.colors.tertiary !== undefined) normalizeHex(input.colors.tertiary);
  const roles: Role[] = ["primary", "secondary", "tertiary"];
  for (const key of ["mark", "wordmark"] as const) {
    if (!roles.includes(input.colorway[key])) throw new Error(`kit: colorway.${key} must be primary, secondary or tertiary`);
  }
  const ground = input.colorway.ground;
  if (ground !== undefined && ground !== "white" && !roles.includes(ground)) throw new Error("kit: colorway.ground must be white or a role");
}

export async function buildKit(input: KitInput, options: KitOptions = {}): Promise<KitResult> {
  validate(input);
  const fetcher = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const name = input.name.trim();
  const [mark, font] = await Promise.all([traceMark(input.mark.bytes), loadFont(input.fontFamily, input.fontWeight ?? 400, fetcher)]);
  const setType = (fontSize: number) => setText(font, name, fontSize);

  const art: Record<"primary" | "stacked" | "icon" | "wordmark", Artwork> = {
    primary: primaryLockup(mark, setType),
    stacked: stackedLockup(mark, setType),
    icon: iconArtwork(mark),
    wordmark: wordmarkArtwork(setType),
  };

  const markColor = resolve(input.colors, input.colorway.mark);
  const wordColor = resolve(input.colors, input.colorway.wordmark);
  const groundColor = resolve(input.colors, input.colorway.ground ?? "white");
  const fills: Record<Variant, Fills> = {
    color: { mark: markColor, wordmark: wordColor },
    black: { mark: "#000000", wordmark: "#000000" },
    white: { mark: "#FFFFFF", wordmark: "#FFFFFF" },
  };

  const slug = slugify(name);
  const encoder = new TextEncoder();
  const files: KitFile[] = [];
  const title = (lockup: Lockup, variant: Variant) => `${name}, ${LABELS[lockup]}, ${VARIANT_LABELS[variant]}`;

  for (const lockup of ["primary", "stacked", "icon", "wordmark"] as const) {
    for (const variant of ["color", "black", "white"] as const) {
      const a = art[lockup];
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

  const canvases = { square: squareArtwork(art.icon), social: socialArtwork(art.primary) };
  for (const lockup of ["square", "social"] as const) {
    const a = canvases[lockup];
    const svg = toSvg(a, { ...fills.color, ground: groundColor }, title(lockup, "color"), { width: a.width, height: a.height });
    const png = toPng(svg, a);
    files.push({ path: `${lockup}/${slug}-${lockup}.png`, mime: "image/png", bytes: png.bytes, lockup, variant: "color", format: "png", width: png.width, height: png.height });
  }

  return { files, spec: buildSpec(name, input.colors, input.colorway, font.info) };
}
