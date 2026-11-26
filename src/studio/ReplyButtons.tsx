import { PRIMARY, PRIMARY_LABEL, SECONDARY, SECONDARY_LABEL } from "../components/states";

/**
 * What a row of reply buttons under one of Gala's lines shows:
 * its labels, where it stands, and which button was pressed.
 *
 *   - Default: both pressable, with gala-button's hover, pressed and focus.
 *   - Working: from the press until Gala has it. The pressed one shows
 *     Pressed; the other is Disabled.
 *   - Done: the move is answered, typed or pressed. Both Disabled, kept
 *     read-only in the history.
 */
export type ReplyState = "Default" | "Working" | "Done";

export type Reply = {
  primary: string;
  /** Null for a single button ("Go ahead"): gala-reply-buttons with Second button off. */
  secondary: string | null;
  state: ReplyState;
  /** In Working, the button that was pressed. */
  pressed: "primary" | "secondary" | null;
};

/** The pressed look, held while Working (gala-button State=Pressed). */
const PRIMARY_HELD = "bg-button-1-pressed-light dark:bg-button-1-pressed-dark";
const SECONDARY_HELD = "border-text-blue-1-light bg-background-3-light dark:border-text-blue-1-dark dark:bg-background-3-dark";

/**
 * gala-reply-buttons (Figma 5676:17505): one primary and one secondary
 * button under a Gala line, built from gala-button. The same row serves
 * every offered move: Yes, redraw / No; the second dead end's two exits;
 * Keep it / Draw new ones; and Go ahead alone.
 */
export function ReplyButtons({ reply, onPrimary, onSecondary }: { reply: Reply; onPrimary: () => void; onSecondary?: () => void }) {
  const working = reply.state === "Working";
  const done = reply.state === "Done";
  const primaryOff = done || (working && reply.pressed !== "primary");
  const secondaryOff = done || (working && reply.pressed !== "secondary");
  return (
    <div className="relative flex shrink-0 items-center gap-[12px]" data-name="gala-reply-buttons" data-state={reply.state}>
      <button
        type="button"
        onClick={onPrimary}
        disabled={primaryOff}
        aria-disabled={working || done}
        className={`relative flex h-[40px] shrink-0 items-center justify-center rounded-[12px] px-[20px] ${PRIMARY} ${working && reply.pressed === "primary" ? `pointer-events-none ${PRIMARY_HELD}` : ""}`}
        data-name="primary"
      >
        <span className={`type-caption-semibold shrink-0 whitespace-nowrap ${PRIMARY_LABEL}`}>{reply.primary}</span>
      </button>
      {reply.secondary !== null && (
        <button
          type="button"
          onClick={onSecondary}
          disabled={secondaryOff}
          aria-disabled={working || done}
          className={`relative flex h-[40px] shrink-0 items-center justify-center rounded-[12px] px-[16px] ${SECONDARY} ${working && reply.pressed === "secondary" ? `pointer-events-none ${SECONDARY_HELD}` : ""}`}
          data-name="secondary"
        >
          <span className={`type-caption-semibold shrink-0 whitespace-nowrap ${SECONDARY_LABEL}`}>{reply.secondary}</span>
        </button>
      )}
    </div>
  );
}
