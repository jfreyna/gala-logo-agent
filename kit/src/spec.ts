/**
 * The spec sheet data the panel's Kit view shows: clear space, minimum
 * sizes, type, and each brand color with hex, RGB, CMYK, its 50 to 900
 * ladder and its contrast, plus the contrast of every color pairing the
 * files use. Every number here is computed in code, so what Gala says about
 * contrast can be read straight from it.
 */

import { cmyk, contrast, hexToRgb, ladder, nearestStep, normalizeHex, type Contrast, type LadderEntry, type LadderStep, type Rgb, type Role } from "./color.ts";
import type { FontInfo } from "./font.ts";

export const CMYK_NOTE = "CMYK values are a straight conversion, for reference. Confirm them with your printer before a print run.";
export const TYPE_SAMPLE = "Aa Bb Cc Dd Ee 0123456789";

/** From the Kit view: 18px of clear space around a 40px mark. */
export const CLEAR_SPACE_RATIO = 18 / 40;

/** From the Kit view's "Minimum sizes" rows. */
export const MINIMUM_SIZES = [
  { key: "icon", label: "Icon", px: 16, measure: "side" },
  { key: "primary", label: "Primary lock-up", px: 120, measure: "width" },
  { key: "wordmark", label: "Wordmark", px: 80, measure: "width" },
] as const;

export type Colors = { primary: string; secondary: string; tertiary?: string };
export type Ground = Role | "white";
export type Colorway = { mark: Role; wordmark: Role; ground?: Ground };

export type SpecColor = {
  role: Role;
  hex: string;
  rgb: Rgb;
  cmyk: [number, number, number, number];
  ladder: LadderEntry[];
  nearestStep: LadderStep;
  contrast: { onWhite: Contrast; onBlack: Contrast };
};

export type SpecPair = { foreground: Role | "white" | "black"; background: Role | "white" | "black"; contrast: Contrast };

export type SpecSheet = {
  version: 1;
  name: string;
  clearSpace: { basis: "markHeight"; ratio: number };
  minimumSizes: { key: "icon" | "primary" | "wordmark"; label: string; px: number; measure: "side" | "width" }[];
  type: FontInfo & { sample: string };
  colors: SpecColor[];
  pairs: SpecPair[];
  cmykNote: string;
};

const WHITE = "#FFFFFF";
const BLACK = "#000000";

export function rolesIn(colors: Colors): Role[] {
  return colors.tertiary === undefined ? ["primary", "secondary"] : ["primary", "secondary", "tertiary"];
}

export function resolve(colors: Colors, key: Role | "white" | "black"): string {
  if (key === "white") return WHITE;
  if (key === "black") return BLACK;
  const hex = colors[key];
  if (hex === undefined) throw new Error(`kit: the colorway uses ${key}, but no ${key} color was given`);
  return normalizeHex(hex);
}

export function buildSpec(name: string, colors: Colors, colorway: Colorway, font: FontInfo): SpecSheet {
  const specColors: SpecColor[] = rolesIn(colors).map((role) => {
    const hex = resolve(colors, role);
    const steps = ladder(hex);
    return {
      role,
      hex,
      rgb: hexToRgb(hex),
      cmyk: cmyk(hex),
      ladder: steps,
      nearestStep: nearestStep(hex, steps),
      contrast: { onWhite: contrast(hex, WHITE), onBlack: contrast(hex, BLACK) },
    };
  });

  const ground = colorway.ground ?? "white";
  const seen = new Set<string>();
  const pairs: SpecPair[] = [];
  const addPair = (foreground: SpecPair["foreground"], background: SpecPair["background"]) => {
    const key = `${foreground}/${background}`;
    if (seen.has(key) || foreground === background) return;
    seen.add(key);
    pairs.push({ foreground, background, contrast: contrast(resolve(colors, foreground), resolve(colors, background)) });
  };
  // The color lock-ups sit on white; the square and social image sit on the ground.
  for (const bg of ["white", ground] as const) {
    addPair(colorway.mark, bg);
    addPair(colorway.wordmark, bg);
  }

  return {
    version: 1,
    name,
    clearSpace: { basis: "markHeight", ratio: CLEAR_SPACE_RATIO },
    minimumSizes: MINIMUM_SIZES.map((m) => ({ ...m })),
    type: { ...font, sample: TYPE_SAMPLE },
    colors: specColors,
    pairs,
    cmykNote: CMYK_NOTE,
  };
}
