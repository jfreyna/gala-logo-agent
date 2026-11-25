import { useReducedMotion } from "../lib/motion";

/**
 * The mark beside Gala's "working" line (gala-message, Working): a circle,
 * a square and a triangle that draw, fill, rise and clear in a loop.
 *
 * It is a slot, like the page backdrops: the picture is a file, so another
 * one replaces it with no change here.
 *   /thinking/gala-thinking.svg          the animated mark
 *   /thinking/gala-thinking-static.svg   the still, shown when the
 *                                        visitor's system asks for reduced
 *                                        motion
 *
 * The file is used as a mask over the current text color, so it takes the
 * color of the line it sits beside in both modes, whatever color the file
 * itself names; an image element could not inherit it. The file's own
 * animation runs inside the mask. The slot is the size the design draws
 * the mark, 32 by 16; a file of another shape is fitted inside it.
 */
export function Thinking({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  const file = `/thinking/gala-thinking${reduced ? "-static" : ""}.svg`;
  const mask = `url("${file}") center / contain no-repeat`;
  return (
    <span
      aria-hidden="true"
      className={`block h-[16px] w-[32px] shrink-0 bg-current ${className}`}
      style={{ mask, WebkitMask: mask }}
      data-name="thinking"
      data-file={file}
    />
  );
}
