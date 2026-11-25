/**
 * The few lines Gala says that no model writes. They are fixed so that they
 * can be relied on exactly when a model's answer can't be.
 */

/** Said in place of a reply that failed a prompt-protection check. */
export const DECLINE_LINE = "I keep my working notes to myself. Your logo, though, I’ll talk about all day.";

/** Said when a model or a check could not be reached after retries. */
export const TROUBLE_LINE = "Something went wrong on my side. Send that again and I’ll pick it up.";

/** The "working" lines the studio shows while a step runs. */
export const WORKING = {
  research: "Looking at competitors and neighbors",
  type: "Setting your name in three typefaces",
  directions: "Drawing three directions",
  variations: "Drawing three variations",
  stressTest: "Testing the mark",
  colorways: "Applying your colors",
  kit: "Building your kit",
  picks: "Checking your picks",
} as const;

/** Gala's line above the pick-your-colors card (from the studio's design). */
export const PICK_COLORS_LINE = "Now it’s time to pick your colors. Primary leads, secondary supports, and tertiary is optional.";

/** Gala's line above the picks card (from the studio's design). */
export const PICKS_LINE = "One last thing, and it’s optional.";

/** Gala's line above the colorways when no checked line could be written. */
export const COLORWAYS_LINE = "Three colorways with your colors. Pick the one that feels like the brand.";

/** Gala's handoff line when no checked line could be written (from the studio's design). */
export const KIT_LINE =
  "Your lock-up kit is ready. You have primary, stacked, and monochrome variants in SVG and EPS, plus a quick-reference sheet for your hex and CMYK values.";
