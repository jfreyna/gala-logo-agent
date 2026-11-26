/**
 * What the box says after the brief at the drawing steps, on desktop and on
 * a phone (gala-prompt-bar / no clip, Figma 5676:17707, FRI-1721). Gala
 * looks at images only while the brief is written, so there the box asks
 * for words.
 */
export const AFTER_BRIEF = "Describe it and I'll draw it.";

/**
 * The steps whose frames draw "Describe it and I'll draw it." (the Gala
 * seat's gate-read on FRI-1721): the drawing steps. Every other step after
 * the brief keeps its own placeholder, since "draw it" doesn't fit there.
 */
export const DRAWING_STEPS = ["symbolOpener", "directions", "variations", "stressTest"];

/**
 * The prompt bar at a step: whether it shows the attach button, and its
 * placeholder for desktop and for a phone. The attach button shows only at
 * the brief; after it the bar is gala-prompt-bar / no clip (FRI-1721).
 * The step is the project's stage; a plain string, so the engine's checks can
 * import this file as it is.
 */
export function promptFor(stage: string, hasBrief: boolean): { canAttach: boolean; placeholder: string; placeholderMobile: string } {
  const bar = (placeholder: string, placeholderMobile: string) => ({ canAttach: stage === "brief", placeholder, placeholderMobile });
  if (DRAWING_STEPS.includes(stage)) return bar(AFTER_BRIEF, AFTER_BRIEF);
  switch (stage) {
    case "brief":
      return hasBrief ? bar("Tell me who it’s for, mostly.", "Tell me who it’s for.") : bar("Tell me about the brand you're building.", "Tell me about your brand.");
    case "research":
      return bar("Or tell me what to change in the direction.", "Or tell me what to change in the direction.");
    case "type":
      return bar("Pick A, B or C, or name a font you like.", "Pick A, B or C.");
    case "wordmark":
      return bar("Approve the wordmark, or ask for a change.", "Approve, or ask for a change.");
    case "lockup":
      return bar("Approve the lockup, or ask for a change.", "Approve, or ask for a change.");
    case "pickColors":
      return bar("Or describe your colors in words.", "Or describe your colors in words.");
    case "colorways":
      return bar("Pick A, B or C, or ask for other colors.", "Pick A, B or C.");
    default:
      return bar("Ask for a change, or start a new project.", "Ask for a change.");
  }
}
