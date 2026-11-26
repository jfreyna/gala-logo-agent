/**
 * The few lines Gala says that no model writes. They are fixed so that they
 * can be relied on exactly when a model's answer can't be.
 */

/** Said in place of a reply that failed a prompt-protection check. */
export const DECLINE_LINE = "I keep my working notes to myself. Your logo, though, I’ll talk about all day.";

/** Said when a model or a check could not be reached after retries. */
export const TROUBLE_LINE = "Something went wrong on my side. Send that again and I’ll pick it up.";

/**
 * Said when the chosen typeface cannot draw the name: what is wrong, in
 * plain words, and what to do next. `atType` is true on the type step,
 * where the person can pick again right there.
 */
export function cannotDrawLine(name: string, problem: { family: string; why: string; letters: string[] }, atType: boolean): string {
  // A color typeface draws, but not as a logo: the kit draws it in one color, so Gala doesn't use them.
  if (problem.why === "color") {
    const next = atType ? "Pick another typeface and I’ll set the name in it." : "Want to go back to type and pick another?";
    return `${problem.family} is a color typeface, and I don’t use those: your logo is drawn in one color, so its colors would be lost. ${next}`;
  }
  const drawn = [...new Set([...name].filter((letter) => letter.trim() !== ""))];
  const lacksAll = problem.letters.length > 0 && drawn.every((letter) => problem.letters.some((missing) => missing.includes(letter)));
  const reason =
    problem.why === "notOnGoogle"
      ? "it isn’t on Google Fonts"
      : problem.why === "missingLetters" && lacksAll
        ? "that typeface has none of the letters in the name"
        : problem.why === "missingLetters"
          ? `that typeface has no ${new Intl.ListFormat("en", { type: "disjunction" }).format(problem.letters)}`
          : "that typeface has no outlines I can draw";
  const next = atType ? "Pick another typeface and I’ll set the name in it." : "Want to go back to type and pick another?";
  return `I can’t draw “${name}” in ${problem.family}: ${reason}. ${next}`;
}

/** Said when no typeface that was tried can draw the name. */
export const NO_TYPEFACE_LINE = "I couldn’t find a typeface that has every letter in your name. Name one you know has them and I’ll set it.";

/** The "working" lines the studio shows while a step runs. */
export const WORKING = {
  brief: "Reading your brief",
  research: "Looking at competitors and neighbors",
  type: "Setting your name in three typefaces",
  wordmark: "Setting your name as a wordmark",
  directions: "Drawing three directions",
  variations: "Drawing three variations",
  stressTest: "Testing the mark",
  lockup: "Putting the symbol and the wordmark together",
  colorways: "Applying your colors",
  kit: "Building your kit",
  picks: "Checking your picks",
} as const;

/** Gala's line above the pick-your-colors card (from the studio's design). */
export const PICK_COLORS_LINE = "Now it’s time to pick your colors. Primary leads, secondary supports, and tertiary is optional.";

/** Gala's line above the picks card (from the studio's design). */
export const PICKS_LINE = "One last thing, and it’s optional.";

/** Gala's line above the picks card when it follows the first finished kit download (FRI-1723). */
export const FILES_SAVED_LINE = "Files saved. One last thing, and it’s optional.";

/** Gala's line above the colorways when no checked line could be written. */
export const COLORWAYS_LINE = "Three colorways with your colors. Pick the one that feels like the brand.";

/** Gala's handoff line when no checked line could be written (from the studio's design). */
export const KIT_LINE =
  "Your lock-up kit is ready. You have primary, stacked, and monochrome variants in SVG and EPS, plus a quick-reference sheet for your hex and CMYK values.";

/** The same, for a logo of the name alone: nothing in it names a mark or a lock-up. */
export const NAME_ONLY_KIT_LINE = "Your wordmark kit is ready. You have it in color, all black and all white, in SVG and EPS, plus a quick-reference sheet for your hex and CMYK values.";

/**
 * Said when the person picked from an earlier round of the step and no
 * checked line could be written: which one, and which round it came from.
 */
export function pickedEarlierLine(name: string, roundsAfterIt: number): string {
  const which = roundsAfterIt <= 1 ? "the round before" : `${roundsAfterIt} rounds back`;
  return `${name} it is, from ${which}.`;
}

/**
 * Said when the person asked for an earlier round back, with no change,
 * and no checked line could be written: which one, which round, and what
 * to do next.
 */
export function broughtBackFixedLine(name: string, roundsAfterIt: number): string {
  const which = roundsAfterIt <= 1 ? "the round before" : `${roundsAfterIt} rounds back`;
  return `Here’s the round with ${name} again, from ${which}. Pick one, or tell me what to change.`;
}
