/**
 * The states every button and chip has (Figma gala-button 5666:18006 and
 * gala-filter-chip 5548:7011), as class lists to add to a
 * button's own layout classes.
 *
 *   - Hover shows on pointer devices only (tailwind.config.js turns on
 *     hoverOnlyWhenSupported), and never on a disabled control.
 *   - Pressed is :active, on mouse down or touch.
 *   - Focus is keyboard focus only (:focus-visible): a 2px text-blue-1 ring
 *     outside the control, so it never blends with the purple fill.
 *   - Disabled is not clickable, and looks it.
 *   - Changes ease out over 120ms.
 *
 * A label inside a button takes the disabled color from the button with
 * the `group-disabled:` classes in the *_LABEL lists.
 */
const EASE = "transition-[color,background-color,border-color,opacity] duration-[120ms] ease-out";
export const FOCUS = "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-text-blue-1-light dark:focus-visible:outline-text-blue-1-dark";

/** Primary: the purple fill, lighter on hover, deeper when pressed, the inactive tint when disabled. */
export const PRIMARY = `group ${EASE} ${FOCUS} bg-button-1-default-light dark:bg-button-1-default-dark enabled:hover:bg-button-1-hover-light dark:enabled:hover:bg-button-1-hover-dark enabled:active:bg-button-1-pressed-light dark:enabled:active:bg-button-1-pressed-dark disabled:bg-button-inactive-light dark:disabled:bg-button-inactive-dark`;
export const PRIMARY_LABEL = "text-button-light-text group-disabled:text-text-neutral-2-light dark:group-disabled:text-text-neutral-2-dark";

/** Secondary: stroke-2 outline; lifts on hover, background-3 with a text-blue-1 border when pressed, stroke-1 when disabled. */
export const SECONDARY = `group ${EASE} ${FOCUS} border border-solid border-stroke-2-light dark:border-stroke-2-dark enabled:hover:bg-neutral-0 dark:enabled:hover:bg-background-2-dark enabled:active:border-text-blue-1-light enabled:active:bg-background-3-light dark:enabled:active:border-text-blue-1-dark dark:enabled:active:bg-background-3-dark disabled:border-stroke-1-light dark:disabled:border-stroke-1-dark`;
export const SECONDARY_LABEL = "text-text-neutral-1-light dark:text-text-neutral-1-dark group-disabled:text-text-neutral-2-light dark:group-disabled:text-text-neutral-2-dark";

/** Link: text-blue-1, underlined on hover, button-1-pressed while pressed, its ring 2px out from the words. */
export const LINK = `${EASE} ${FOCUS} rounded-[4px] focus-visible:outline-offset-2 text-text-blue-1-light dark:text-text-blue-1-dark enabled:hover:underline enabled:active:underline enabled:active:text-button-1-pressed-light dark:enabled:active:text-button-1-pressed-dark disabled:text-text-neutral-2-light dark:disabled:text-text-neutral-2-dark`;

/** A button with no drawn states of its own (an icon, Hints): the keyboard ring and the ease. */
export const PLAIN = `${EASE} ${FOCUS}`;

/** gala-filter-chip as a choice. Every chip has a border, so selected and not are the same height (27px). */
export function chipClass(selected: boolean): string {
  const base = `group ${EASE} ${FOCUS} relative flex shrink-0 items-start rounded-[999px] border border-solid px-[10px] py-[4px] disabled:opacity-60`;
  return selected
    ? `${base} border-background-3-light bg-background-3-light dark:border-background-3-dark dark:bg-background-3-dark enabled:hover:border-text-blue-1-light dark:enabled:hover:border-text-blue-1-dark`
    : `${base} border-stroke-2-light dark:border-stroke-2-dark enabled:hover:border-text-blue-1-light enabled:hover:bg-neutral-0 dark:enabled:hover:border-text-blue-1-dark dark:enabled:hover:bg-background-2-dark disabled:border-stroke-1-light dark:disabled:border-stroke-1-dark`;
}
export function chipLabelClass(selected: boolean): string {
  return selected
    ? "type-mini-semibold shrink-0 whitespace-nowrap text-text-neutral-1-light dark:text-text-neutral-1-dark"
    : "type-mini-semibold shrink-0 whitespace-nowrap text-text-neutral-2-light group-enabled:group-hover:text-text-neutral-1-light dark:text-text-neutral-2-dark dark:group-enabled:group-hover:text-text-neutral-1-dark";
}
