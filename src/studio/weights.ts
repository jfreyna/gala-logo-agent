/**
 * A font weight by its usual name, as the wordmark card's heading says it
 * ("Buda · Light"). The names are the ones CSS and Google Fonts use for
 * each hundred; a weight between two hundreds takes the nearer name.
 *
 * No imports, so the checks can read this file directly.
 */
const NAMES: [number, string][] = [
  [100, "Thin"],
  [200, "ExtraLight"],
  [300, "Light"],
  [400, "Regular"],
  [500, "Medium"],
  [600, "SemiBold"],
  [700, "Bold"],
  [800, "ExtraBold"],
  [900, "Black"],
];

export function weightName(weight: number): string {
  return NAMES.reduce((best, entry) => (Math.abs(entry[0] - weight) < Math.abs(best[0] - weight) ? entry : best))[1];
}
