/**
 * Colorways: every way the person's own colors can fill the mark, the
 * wordmark and the ground, each with its contrast computed in code.
 *
 * Gala does not invent a palette. The model picks three of these options
 * and says why; the numbers it is given are these numbers, and what it
 * says about contrast is checked against them before it shows.
 */
import { contrast } from "../kit/src/color.ts";

export type Role = "primary" | "secondary" | "tertiary";
export type Ground = Role | "white";
export type BrandColors = { primary: string; secondary: string; tertiary: string | null };

export type ColorwayOption = {
  id: string;
  mark: Role;
  wordmark: Role;
  ground: Ground;
  /** WCAG contrast of the mark and of the wordmark against the ground. */
  markOnGround: { ratio: string; passesLargeText: boolean };
  wordmarkOnGround: { ratio: string; passesText: boolean; passesLargeText: boolean };
};

export function hexOf(colors: BrandColors, key: Ground): string {
  if (key === "white") return "#FFFFFF";
  const value = colors[key];
  if (value === null) throw new Error(`No ${key} color was picked.`);
  return value;
}

/** Every assignment of roles in which the mark and the wordmark differ from the ground. */
export function colorwayOptions(colors: BrandColors): ColorwayOption[] {
  const roles: Role[] = colors.tertiary === null ? ["primary", "secondary"] : ["primary", "secondary", "tertiary"];
  const grounds: Ground[] = ["white", ...roles];
  const options: ColorwayOption[] = [];
  for (const ground of grounds) {
    for (const mark of roles) {
      for (const wordmark of roles) {
        if (mark === ground || wordmark === ground) continue;
        const markContrast = contrast(hexOf(colors, mark), hexOf(colors, ground));
        const wordContrast = contrast(hexOf(colors, wordmark), hexOf(colors, ground));
        options.push({
          id: `${mark}-${wordmark}-on-${ground}`,
          mark,
          wordmark,
          ground,
          markOnGround: { ratio: markContrast.label, passesLargeText: markContrast.aaLarge },
          wordmarkOnGround: { ratio: wordContrast.label, passesText: wordContrast.aaText, passesLargeText: wordContrast.aaLarge },
        });
      }
    }
  }
  return options;
}

/** "primary" as the cards name it: "Primary". */
export function roleName(role: Role): "Primary" | "Secondary" | "Tertiary" {
  return (role.charAt(0).toUpperCase() + role.slice(1)) as "Primary" | "Secondary" | "Tertiary";
}
