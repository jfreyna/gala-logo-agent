/**
 * Color maths, computed in code so that what Gala says about a color always
 * matches the numbers shown beside it.
 */

export type Rgb = { r: number; g: number; b: number };

/** "#B83A1B" or "b83a1b" (or the 3-digit form) to channels, or null if it isn't a hex color. */
export function parseHex(value: string): Rgb | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? match[1].replace(/./g, "$&$&") : match[1];
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  };
}

/** Channels to "#B83A1B". */
export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** WCAG 2 relative luminance, 0 (black) to 1 (white). */
export function luminance({ r, g, b }: Rgb): number {
  const linear = (channel: number) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2 contrast ratio between two colors, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** The ratio text needs against its ground to pass WCAG AA. */
export const TEXT_CONTRAST_MINIMUM = 4.5;

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

export type ContrastResult = { label: string; pass: boolean };

/**
 * A color's contrast on white and on black, as the two badges show it:
 * "On white 5.7:1", passing at 4.5:1 or more. The pass is judged on the
 * ratio as displayed, so the badge never contradicts its own number.
 */
export function contrastBadges(color: Rgb): [ContrastResult, ContrastResult] {
  const badge = (ground: Rgb, name: string): ContrastResult => {
    const shown = contrast(color, ground).toFixed(1);
    return { label: `On ${name} ${shown}:1`, pass: Number(shown) >= TEXT_CONTRAST_MINIMUM };
  };
  return [badge(WHITE, "white"), badge(BLACK, "black")];
}

/**
 * RGB to CMYK by the plain formula (no color profile), in whole percents.
 * This is a reference conversion, not press-accurate; the kit says so.
 */
export function toCmyk({ r, g, b }: Rgb): { c: number; m: number; y: number; k: number } {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const k = 1 - Math.max(red, green, blue);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  const percent = (value: number) => Math.round(((1 - value - k) / (1 - k)) * 100);
  return { c: percent(red), m: percent(green), y: percent(blue), k: Math.round(k * 100) };
}

/** "HEX #B83A1B   RGB 184 58 27   CMYK 0 68 85 28", the kit's one-line values. */
export function valuesLine(color: Rgb): string {
  const cmyk = toCmyk(color);
  return `HEX ${toHex(color)}   RGB ${color.r} ${color.g} ${color.b}   CMYK ${cmyk.c} ${cmyk.m} ${cmyk.y} ${cmyk.k}`;
}
