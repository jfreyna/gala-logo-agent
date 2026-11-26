/** No imports: the engine's check:two-line reads this file too. */

/**
 * The name on one line or two (FRI-1728), set by what the person says.
 * `breakAfter` is how many words go on the first line. Absent on cards from
 * before the setting: one line.
 */
export type NameLines = { lines?: "oneLine" | "twoLines"; breakAfter?: number | null };

/**
 * The name's size against the symbol's on the lockup card when it is on two
 * lines: the kit's own ratios (kit/src/layout.ts, LOCKUP_RATIOS), so the
 * card draws what the files hold. check:two-line holds them equal.
 */
export const TWO_LINE_TYPE: Record<"sideBySide" | "stacked", number> = { sideBySide: 22 / 48, stacked: 16 / 56 };

/** The name's lines as a card draws them: the whole name, or its words split after `breakAfter`. */
export function linesOfName(name: string, value: NameLines): string[] {
  const words = name.trim().split(/\s+/);
  const after = value.lines === "twoLines" ? value.breakAfter : null;
  if (typeof after !== "number" || after < 1 || after >= words.length) return [name];
  return [words.slice(0, after).join(" "), words.slice(after).join(" ")];
}
