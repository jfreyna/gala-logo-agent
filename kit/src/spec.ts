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
/**
 * What the square and the social image sit on: a neutral light gray by
 * default, white, or one of the brand colors.
 */
export type Ground = Role | "white" | "neutral";
/** The neutral ground: a light gray, so a white mark edge still shows in a feed or an avatar. */
export const NEUTRAL_GROUND = "#F5F5F5";
export type Colorway = {
  mark: Role;
  wordmark: Role;
  ground?: Ground;
  /** The colorway's card letter and name ("C", "Quiet Stock"), for the spec sheet's Colorway section. Labels only. */
  letter?: string;
  name?: string;
};

/** What a color does in the chosen colorway: fills the mark, the name, or is the ground. Empty when the colorway does not use it. */
export type ColorUse = "mark" | "wordmark" | "ground";

export type SpecColor = {
  role: Role;
  hex: string;
  rgb: Rgb;
  cmyk: [number, number, number, number];
  ladder: LadderEntry[];
  nearestStep: LadderStep;
  contrast: { onWhite: Contrast; onBlack: Contrast };
  /** What this color does in the chosen colorway. A logo of the name alone never lists "mark". */
  uses: ColorUse[];
};

/**
 * The chosen colorway as the spec sheet shows it. `files` names,
 * per lock-up, the variant whose files carry the colorway's fills: "color",
 * or "black" / "white" when the colorway paints that lock-up the same as the
 * all-black or all-white set, which then stands in for it. `onGround` is
 * true when the kit holds every lock-up on the ground too (a brand-color
 * ground).
 */
export type SpecColorway = {
  letter: string | null;
  name: string | null;
  mark: Role;
  wordmark: Role;
  ground: Ground;
  markHex: string;
  wordmarkHex: string;
  groundHex: string;
  onGround: boolean;
  files: Partial<Record<"primary" | "stacked" | "icon" | "wordmark", "color" | "black" | "white">>;
};

export type SpecPair = { foreground: Role | "white" | "black"; background: Role | "white" | "black" | "neutral"; contrast: Contrast };

export type SpecSheet = {
  version: 1;
  name: string;
  /** Clear space as a share of the mark's height, or of the wordmark's when the logo has no symbol. */
  clearSpace: { basis: "markHeight" | "wordmarkHeight"; ratio: number };
  minimumSizes: { key: "icon" | "primary" | "wordmark"; label: string; px: number; measure: "side" | "width" }[];
  type: FontInfo & { sample: string };
  colors: SpecColor[];
  pairs: SpecPair[];
  /** Added with the colorway's own files; kits built before it have none. */
  colorway?: SpecColorway;
  cmykNote: string;
};

const WHITE = "#FFFFFF";
const BLACK = "#000000";

export function rolesIn(colors: Colors): Role[] {
  return colors.tertiary === undefined ? ["primary", "secondary"] : ["primary", "secondary", "tertiary"];
}

export function resolve(colors: Colors, key: Role | "white" | "black" | "neutral"): string {
  if (key === "white") return WHITE;
  if (key === "neutral") return NEUTRAL_GROUND;
  if (key === "black") return BLACK;
  const hex = colors[key];
  if (hex === undefined) throw new Error(`kit: the colorway uses ${key}, but no ${key} color was given`);
  return normalizeHex(hex);
}

/** True when the ground is a brand color, so the kit holds every lock-up on it. */
export function isBrandGround(ground: Ground | undefined): ground is Role {
  return ground === "primary" || ground === "secondary" || ground === "tertiary";
}

export function buildSpec(
  name: string,
  colors: Colors,
  colorway: Colorway,
  font: FontInfo,
  options: { nameOnly?: boolean; files?: SpecColorway["files"] } = {},
): SpecSheet {
  const usesOf = (role: Role): ColorUse[] => [
    ...(!options.nameOnly && colorway.mark === role ? (["mark"] as const) : []),
    ...(colorway.wordmark === role ? (["wordmark"] as const) : []),
    ...(colorway.ground === role ? (["ground"] as const) : []),
  ];
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
      uses: usesOf(role),
    };
  });

  const ground = colorway.ground ?? "neutral";
  const seen = new Set<string>();
  const pairs: SpecPair[] = [];
  const addPair = (foreground: SpecPair["foreground"], background: SpecPair["background"]) => {
    const key = `${foreground}/${background}`;
    if (seen.has(key) || foreground === background) return;
    seen.add(key);
    pairs.push({ foreground, background, contrast: contrast(resolve(colors, foreground), resolve(colors, background)) });
  };
  // The transparent lock-ups are read on white; the square, the social image and the on-ground lock-ups sit on the ground.
  for (const bg of ["white", ground] as const) {
    addPair(colorway.mark, bg);
    addPair(colorway.wordmark, bg);
  }

  return {
    version: 1,
    name,
    clearSpace: { basis: options.nameOnly ? "wordmarkHeight" : "markHeight", ratio: CLEAR_SPACE_RATIO },
    // A logo of the name alone has no icon and no lock-up to size.
    minimumSizes: MINIMUM_SIZES.filter((m) => !options.nameOnly || m.key === "wordmark").map((m) => ({ ...m })),
    type: { ...font, sample: TYPE_SAMPLE },
    colors: specColors,
    pairs,
    colorway: {
      letter: colorway.letter ?? null,
      name: colorway.name ?? null,
      mark: colorway.mark,
      wordmark: colorway.wordmark,
      ground,
      markHex: resolve(colors, colorway.mark),
      wordmarkHex: resolve(colors, colorway.wordmark),
      groundHex: resolve(colors, ground),
      onGround: isBrandGround(ground),
      files: options.files ?? {},
    },
    cmykNote: CMYK_NOTE,
  };
}
