/**
 * Whether a typeface can draw the name, checked by drawing it.
 *
 * The type step runs this on every typeface before offering it, and on the
 * one the person picks, so no pick can dead-end at the wordmark or the kit.
 * It is a live check through the kit's own setter: there is no list of
 * fonts that work or don't, here or anywhere.
 *
 * Reach (gate 3b): it proves the name sets without an error in each case
 * the wordmark step offers, at the weight the steps draw in. It does not
 * prove the result looks right, and a typeface that cannot be reached
 * while checking (the network) is treated as not confirmed, not as broken.
 */
import { CannotSet, loadFont, setText, type LoadedFont } from "../kit/src/font.ts";
import type { Family } from "./fonts.ts";
import { CASE, inCase, type Case } from "./settings.ts";

/** The weight the wordmark step and the kit draw in. */
const WEIGHT = 400;
/** Fonts just loaded, so the step after the check does not download the same file again. */
const KEPT = 24;
const fonts = new Map<string, Promise<LoadedFont>>();

/** The family's font, from the few kept in memory or from Google. */
export function fontFor(family: string): Promise<LoadedFont> {
  let font = fonts.get(family);
  if (font === undefined) {
    font = loadFont(family, WEIGHT, globalThis.fetch as never);
    fonts.set(family, font);
    font.catch(() => fonts.delete(family));
    if (fonts.size > KEPT) fonts.delete(fonts.keys().next().value!);
  }
  return font;
}

/** The name in every case the wordmark step can set it in. */
export function namesToSet(name: string): string[] {
  return [...new Set((Object.keys(CASE.values) as Case[]).map((value) => inCase(name, value)))];
}

/**
 * Null when the typeface draws every one of `names`. A CannotSet says why
 * it can't. "unconfirmed" means the check itself could not finish.
 *
 * A color typeface (COLR, SVG or bitmap glyphs, as the font file reports
 * it) is never used: the kit draws a logo in one color (a product
 * ruling, 2026-11-25). That is a live check on the file, with
 * no list of families, so the offer passes over it for the next-ranked
 * family in its class, and a person who names or picks one is told why.
 */
export type Verdict = null | CannotSet | "unconfirmed";

export async function whyNot(family: string, names: string[]): Promise<Verdict> {
  try {
    const font = await fontFor(family);
    if (font.info.color) return new CannotSet(family, "color", `${family} is a color typeface`);
    for (const name of names) setText(font, name, 16);
    return null;
  } catch (error) {
    if (error instanceof CannotSet) return error;
    console.warn(`Could not check ${family}: ${error instanceof Error ? error.message : "unknown error"}`);
    return "unconfirmed";
  }
}

export type Pick = { typeClass: string; family: Family; person: boolean };

/** How long the type step keeps looking for typefaces that can draw the name before it offers what it has. */
const LOOK_FOR_MS = 20_000;

/**
 * Up to `count` typefaces that can draw the name. The person's own pick
 * goes first if it can be drawn; if not, it is handed back in `refused`
 * with the reason. Then the likeliest classes, one typeface each: the best
 * fit in the class that can draw the name, so a candidate that fails is
 * replaced by the next-ranked family in its class. A class with none gives
 * way to the next likeliest class.
 */
export async function settablePicks(options: {
  /** Classes, likeliest first. */
  classes: string[];
  /** Every family in a class, best fit first. */
  ranked: (typeClass: string) => Family[];
  /** The family the person asked for, and the class it sits in. */
  named?: { typeClass: string; family: Family };
  names: string[];
  count: number;
  check?: (family: string, names: string[]) => Promise<Verdict>;
  lookForMs?: number;
}): Promise<{ picks: Pick[]; refused: CannotSet | null; skipped: string[] }> {
  const check = options.check ?? whyNot;
  const until = Date.now() + (options.lookForMs ?? LOOK_FOR_MS);
  const picks: Pick[] = [];
  const used = new Set<string>();
  const skipped: string[] = [];
  let refused: CannotSet | null = null;

  if (options.named !== undefined) {
    used.add(options.named.family.family);
    const verdict = await check(options.named.family.family, options.names);
    if (verdict === null) picks.push({ ...options.named, person: true });
    else if (verdict instanceof CannotSet) refused = verdict;
    // Not confirmed: the person's pick is still offered. Their choice of it is checked again when they make it.
    else picks.push({ ...options.named, person: true });
  }

  for (const typeClass of options.classes) {
    if (picks.length >= options.count) break;
    for (const candidate of options.ranked(typeClass)) {
      if (Date.now() > until) break;
      if (used.has(candidate.family)) continue;
      used.add(candidate.family);
      if ((await check(candidate.family, options.names)) === null) {
        picks.push({ typeClass, family: candidate, person: false });
        break;
      }
      skipped.push(candidate.family);
    }
  }
  return { picks, refused, skipped };
}
