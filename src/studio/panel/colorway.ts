/**
 * The spec sheet's colorway words (FRI-1730, frame 5689:19050), built from
 * the kit's spec. Code decides every fact (the roles, the uses, the
 * contrast); these functions only word them.
 */
/**
 * A brand color as picked: its role, what it does in the chosen colorway,
 * its contrast on white and on black, and its tints and shades. The
 * contrast badges carry the kit's own labels (`spec.colors[].contrast`), so
 * every number on the sheet comes from one rounding, the one Gala's facts use.
 */
export type PickedColor = { role: string; use: string; hex: string; contrast: PairBadge[]; steps: { step: number; hex: string }[] };

/** A contrast badge: its label ("Tertiary on secondary 7.9:1") and whether it passes 4.5:1. */
export type PairBadge = { label: string; pass: boolean };

export type KitView = {
  view: "kit";
  brandName: string;
  /**
   * The colorway as picked. `paper` is the ground's hex on a brand-color
   * ground, or null for the white paper. Absent for a kit built before
   * FRI-1730.
   */
  colorway?: { paper: string | null; previewUrl: string; title: string | null; pairs: PairBadge[]; caption: string };
  /** `paper`: the ground's hex on a brand-color ground, or null for the white paper (FRI-1730). */
  clearSpace: { previewUrl: string; zoneColor: string; paper?: string | null; caption: string };
  minimumSizes: { item: string; value: string }[];
  type: { family: string; caption: string };
  colors: PickedColor[];
};

type Role = "primary" | "secondary" | "tertiary";
type Use = "mark" | "wordmark" | "ground";

/** What the stored spec holds for the colorway (kits built before FRI-1730 have none). */
export type SpecColorway = {
  letter: string | null;
  name: string | null;
  mark: Role;
  wordmark: Role;
  ground: Role | "white" | "neutral";
  markHex: string;
  wordmarkHex: string;
  groundHex: string;
  onGround: boolean;
  files: Partial<Record<"primary" | "stacked" | "icon" | "wordmark", "color" | "black" | "white">>;
};

/** The kit's computed contrast: `label` is floored to one decimal, `aaText` is at least 4.5:1. */
type Contrast = { ratio: number; label: string; aaText: boolean };
export type SpecPair = { foreground: string; background: string; contrast: Contrast };

/** What a role is for when the colorway leaves it out. */
const GENERAL_USE: Record<Role, string> = {
  primary: "Headlines and accents",
  secondary: "Backgrounds and accents",
  tertiary: "Text and outlines",
};

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** The line under a picked color's role: what it does in this colorway. */
export function useLine(role: Role, uses: Use[]): string {
  if (uses.includes("ground")) return "The ground in your colorway.";
  if (uses.includes("mark") && uses.includes("wordmark")) return "The mark and the name in your colorway.";
  if (uses.includes("mark")) return "The mark in your colorway.";
  if (uses.includes("wordmark")) return "The name in your colorway.";
  return `${GENERAL_USE[role]}. Not in this colorway.`;
}

/** "C · Quiet Stock", or null when the kit has no letter or name. */
export function colorwayTitle(colorway: SpecColorway): string | null {
  const parts = [colorway.letter, colorway.name].filter((part): part is string => part !== null && part !== "");
  return parts.length === 0 ? null : parts.join(" · ");
}

/** "Tertiary", or "Primary mark and tertiary name" when they differ. A logo of the name alone names only the name's color. */
function fillsPhrase(colorway: SpecColorway, nameOnly: boolean): string {
  if (nameOnly || colorway.mark === colorway.wordmark) return capital(colorway.wordmark);
  return `${capital(colorway.mark)} mark and ${colorway.wordmark} name`;
}

export function colorwayCaption(colorway: SpecColorway, nameOnly: boolean): string {
  const fills = fillsPhrase(colorway, nameOnly);
  return colorway.onGround
    ? `${fills} on a ${colorway.ground} ground: the colorway you picked. The kit has every lock-up on this ground, and on transparent for your own backgrounds.`
    : `${fills} on white: the colorway you picked. The kit has every lock-up on transparent, for your own backgrounds.`;
}

/**
 * One badge per distinct pair the colorway's files use (`spec.pairs`): the
 * pairs on the ground on a brand-color ground, else the pairs on white. A
 * logo of the name alone shows only the name's pair. Pass is 4.5:1, as in
 * Colors.
 */
export function pairBadges(colorway: SpecColorway, pairs: SpecPair[], nameOnly: boolean): PairBadge[] {
  const background = colorway.onGround ? colorway.ground : "white";
  const foregrounds = nameOnly ? [colorway.wordmark] : [colorway.mark, colorway.wordmark];
  return pairs
    .filter((pair) => pair.background === background && foregrounds.includes(pair.foreground as Role))
    .map((pair) => ({ label: `${capital(pair.foreground)} on ${pair.background} ${pair.contrast.label}`, pass: pair.contrast.aaText }));
}

/** The stored spec, as far as the Kit view reads it. */
export type KitSpecData = {
  clearSpace: { basis?: "markHeight" | "wordmarkHeight"; ratio: number };
  minimumSizes: { label: string; px: number; measure: "side" | "width" }[];
  type: { family: string; licenseName: string | null };
  colors: { role: Role; hex: string; ladder: { step: string; hex: string }[]; uses?: Use[]; contrast: { onWhite: Contrast; onBlack: Contrast } }[];
  pairs?: SpecPair[];
  /** FRI-1730; absent on kits built before it. */
  colorway?: SpecColorway;
};

/**
 * The spec sheet (the panel's Kit view) from a stored kit. `fileUrl` finds
 * a kit file's address by its label ("primary, color, SVG").
 */
export function kitView(brandName: string, spec: KitSpecData, fileUrl: (label: string) => string | undefined): KitView {
  const nameOnly = spec.clearSpace.basis === "wordmarkHeight";
  const colorway = spec.colorway;
  // The colorway's transparent file: "color", or the all-black / all-white set that stands in for it (FRI-1730).
  // A logo of the name alone has no primary lock-up: its wordmark stands in.
  const colorwayFile = (lockup: "primary" | "wordmark") => fileUrl(`${lockup}, ${colorway?.files[lockup] ?? "color"}, SVG`);
  const previewUrl = colorwayFile("primary") ?? colorwayFile("wordmark") ?? "";
  const paper = colorway?.onGround === true ? colorway.groundHex : null;
  return {
    view: "kit",
    brandName,
    ...(colorway !== undefined
      ? { colorway: { paper, previewUrl, title: colorwayTitle(colorway), pairs: pairBadges(colorway, spec.pairs ?? [], nameOnly), caption: colorwayCaption(colorway, nameOnly) } }
      : {}),
    clearSpace: {
      previewUrl,
      // The dashed line takes the mark's color (the name's, with no symbol), so it shows on the ground.
      zoneColor: colorway !== undefined ? (nameOnly ? colorway.wordmarkHex : colorway.markHex) : (spec.colors[0]?.hex ?? "#000000"),
      paper,
      caption: `Keep clear space equal to ${Math.round(spec.clearSpace.ratio * 100)}% of the ${nameOnly ? "wordmark" : "mark"}’s height on every side.`,
    },
    minimumSizes: spec.minimumSizes.map((size) => ({ item: size.label, value: size.measure === "width" ? `${size.px}px wide` : `${size.px}px` })),
    type: { family: spec.type.family, caption: `${spec.type.family} · the wordmark and headings.${spec.type.licenseName ? ` Free under the ${spec.type.licenseName}.` : ""}` },
    colors: spec.colors.map((color) => ({
      role: capital(color.role),
      use: useLine(color.role, color.uses ?? []),
      hex: color.hex,
      contrast: [
        { label: `On white ${color.contrast.onWhite.label}`, pass: color.contrast.onWhite.aaText },
        { label: `On black ${color.contrast.onBlack.label}`, pass: color.contrast.onBlack.aaText },
      ],
      steps: color.ladder.map((entry) => ({ step: Number(entry.step), hex: entry.hex })),
    })),
  };
}
