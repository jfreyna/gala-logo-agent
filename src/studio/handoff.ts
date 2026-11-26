/**
 * Hand-offs to the message box (FRI-1715, gap A): the card actions and
 * notice buttons that pass the next move to the person's words, so the
 * prompt bar shows Handed off instead of only moving the cursor.
 *
 * No imports, so the checks can read this file directly.
 */

/** How long the bar stays Handed off when the person doesn't type (the component's rule). */
export const HAND_OFF_MS = 6000;

/** True when this action hands the next move to the message box. */
export function handsOff(action: { type: string; action?: { do?: string } }): boolean {
  return action.type === "changeDirection" || action.type === "changeMark" || action.type === "editBrief" || (action.type === "notice" && action.action?.do === "prompt");
}
