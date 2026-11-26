import { Icon } from "../components/Icon";
import { Thinking } from "../components/Thinking";
import type { Past } from "./history";
import type { NoticeAction, NoticeData } from "./failures";
import { LINK, PLAIN, PRIMARY, SECONDARY } from "../components/states";

export type { NoticeAction, NoticeData };

/**
 * gala-card-footer (Figma 5662:16900): replaces a card's buttons and chips
 * once its step is past. "Signed off" when the person approved the card,
 * "This step is behind you" when the project moved on without that. "Back
 * to this step" is the only action, the same path as the Work panel's link:
 * a real turn that Gala answers. It shows only where going back is possible.
 */
export function CardFooter({ past, onBack }: { past: Past; onBack: () => void }) {
  return (
    <div
      className="relative flex w-full shrink-0 items-center justify-between border-t border-solid border-stroke-1-light pt-[12px] dark:border-stroke-1-dark"
      data-name="gala-card-footer"
      data-state={past.signedOff ? "Signed off" : "Past"}
    >
      <div className={`relative flex shrink-0 items-center overflow-clip ${past.signedOff ? "gap-[6px]" : ""}`} data-name="status">
        {past.signedOff && <Icon name="checkCircle" className="text-text-green-1-light dark:text-text-green-1-dark" />}
        <p
          className={`type-caption-semibold shrink-0 whitespace-nowrap ${
            past.signedOff ? "text-text-green-1-light dark:text-text-green-1-dark" : "text-text-neutral-2-light dark:text-text-neutral-2-dark"
          }`}
        >
          {past.signedOff ? "Signed off" : "This step is behind you"}
        </p>
      </div>
      {/* While Gala works, going back waits: the footer says so, the way the Work panel's rows do (gala-button Disabled, with the reason). */}
      {past.backTo !== null && past.working === true && (
        <span className="type-caption-semibold shrink-0 whitespace-nowrap text-text-neutral-2-light dark:text-text-neutral-2-dark" data-name="back-waiting">
          Back to this step when I finish
        </span>
      )}
      {past.backTo !== null && past.working !== true && (
        <button type="button" onClick={onBack} className={`type-caption-semibold shrink-0 whitespace-nowrap ${LINK}`} data-name="back">
          Back to this step
        </button>
      )}
    </div>
  );
}

/**
 * gala-action-echo (Figma 5662:16877): the line a card action leaves on the
 * person's side of the chat. Sending (heard): the thinking mark and the
 * action as it happens, from the click until Gala's working line appears.
 * Sent (done): a check and the action as done.
 */
export function ActionEcho({ label, state }: { label: string; state: "Sending" | "Sent" }) {
  return (
    <div className="relative flex w-full shrink-0 items-start justify-end" data-name="echo-row">
      <div
        className="relative flex shrink-0 items-center gap-[8px] rounded-[999px] border border-solid border-stroke-1-light bg-background-1-light px-[12px] py-[6px] dark:border-stroke-1-dark dark:bg-background-1-dark"
        data-name="gala-action-echo"
        data-state={state}
        role={state === "Sending" ? "status" : undefined}
      >
        {state === "Sending" ? (
          <Thinking className="text-text-neutral-2-light dark:text-text-neutral-2-dark" />
        ) : (
          <Icon name="checkCircle" className="text-text-green-1-light dark:text-text-green-1-dark" />
        )}
        <p className="type-caption-medium shrink-0 whitespace-nowrap text-text-neutral-1-light dark:text-text-neutral-1-dark">{label}</p>
      </div>
    </div>
  );
}


/**
 * gala-notice (Figma 5661:16975): Gala's answer when something didn't work.
 * Couldn't (a known cause), Couldn't start (the turn never began; the
 * choice is saved), Repeated (the same failure twice at a step: a step
 * back, not a retry) and Stopped. A warning-400 rule on the left, a small
 * title, plain words and a way forward. Stopped is the words alone, with no
 * rule or title; when nothing from the turn was kept it offers Try again, one
 * secondary button (Kind=Stopped with retry, 5690:19007).
 */
export function Notice({ notice, onAction }: { notice: NoticeData; onAction: (action: NoticeAction) => void }) {
  const stopped = notice.kind === "Stopped";
  // Stopped draws its one button as secondary; the others lead with a primary.
  const button = (action: NoticeAction, index: number) =>
    index === 0 && !stopped ? (
      <button
        key={action.label}
        type="button"
        onClick={() => onAction(action)}
        className={`relative flex h-[40px] w-full shrink-0 items-center justify-center overflow-clip rounded-[12px] px-[20px] desktop:w-auto ${PRIMARY}`}
        data-name="button-primary"
      >
        <span className="type-caption-semibold shrink-0 whitespace-nowrap text-button-light-text">{action.label}</span>
      </button>
    ) : (
      <button
        key={action.label}
        type="button"
        onClick={() => onAction(action)}
        className={`relative flex h-[40px] w-full shrink-0 items-center justify-center overflow-clip rounded-[12px] px-[16px] desktop:w-auto ${SECONDARY}`}
        data-name="button-secondary"
      >
        <span className="type-caption-semibold shrink-0 whitespace-nowrap text-text-neutral-1-light dark:text-text-neutral-1-dark">{action.label}</span>
      </button>
    );
  const actions =
    notice.actions.length > 0 ? (
      <div className={`relative flex w-full shrink-0 flex-col items-start overflow-clip desktop:w-auto desktop:flex-row ${notice.actions.length > 1 ? "gap-[8px]" : ""}`} data-name="actions">
        {notice.actions.map(button)}
      </div>
    ) : null;
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[6px]" data-name="gala-notice" data-kind={notice.kind}>
      <p className="type-caption-semibold shrink-0 whitespace-nowrap text-headline-1-light dark:text-headline-1-dark">Gala</p>
      <div className={`relative flex w-full shrink-0 flex-col items-start overflow-clip ${stopped ? (actions !== null ? "gap-[12px]" : "") : "gap-[12px] border-l-2 border-solid border-warning-400 pl-[14px]"}`} data-name="notice">
        {stopped ? (
          <>
            <p className="type-body-regular w-full shrink-0 text-text-neutral-1-light [word-break:break-word] dark:text-text-neutral-1-dark">{notice.say}</p>
            {actions}
          </>
        ) : (
          <>
            <p className="type-caption-semibold shrink-0 whitespace-nowrap text-text-neutral-2-light dark:text-text-neutral-2-dark">{notice.title}</p>
            <p className="type-body-regular w-full shrink-0 text-text-neutral-1-light [word-break:break-word] dark:text-text-neutral-1-dark">{notice.say}</p>
            {actions}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * gala-inline-error (Figma 5662:16907): the server's own message, right
 * under the control that failed. It stays until the next action on that
 * control.
 */
export function InlineError({ children }: { children: string }) {
  return (
    <div className="relative flex w-full shrink-0 items-center gap-[6px]" data-name="gala-inline-error" role="alert">
      <span aria-hidden="true" className="size-[6px] shrink-0 rounded-full bg-error-text-light dark:bg-error-text-dark" data-name="dot" />
      <p className="type-caption-medium min-w-px flex-[1_0_0] text-error-text-light [word-break:break-word] dark:text-error-text-dark">{children}</p>
    </div>
  );
}

/** Where a download stands (gala-download-chip): Idle, Saving while the file is fetched, Saved for a few seconds, or Couldn't with a retry in the button itself. */
export type DownloadState = "idle" | "saving" | "saved" | "couldnt";

/**
 * gala-download-chip (Figma 5662:16938): one of the kit's formats, with
 * progress. Hover lifts it like a secondary button; Saving shows the
 * thinking mark; Saved a check; Couldn't says so in the error color, and
 * pressing it again tries again.
 */
export function DownloadChip({ label, state, disabled = false, onPress }: { label: string; state: DownloadState; disabled?: boolean; onPress: () => void }) {
  const couldnt = state === "couldnt";
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled || state === "saving"}
      aria-busy={state === "saving"}
      className={`relative flex shrink-0 items-center justify-center rounded-[8px] border border-solid px-[12px] py-[8px] ${state === "saving" || state === "saved" ? "gap-[6px]" : ""} ${
        couldnt
          ? "border-error-text-light dark:border-error-text-dark"
          : "border-stroke-2-light enabled:hover:border-text-blue-1-light enabled:hover:bg-neutral-0 dark:border-stroke-2-dark dark:enabled:hover:border-text-blue-1-dark dark:enabled:hover:bg-background-2-dark"
      } ${PLAIN}`}
      data-name="gala-download-chip"
      data-state={state}
    >
      {state === "saving" && <Thinking className="text-text-neutral-2-light dark:text-text-neutral-2-dark" />}
      {state === "saved" && <Icon name="checkCircle" className="text-text-green-1-light dark:text-text-green-1-dark" />}
      <span className={`type-caption-semibold shrink-0 whitespace-nowrap ${couldnt ? "text-error-text-light dark:text-error-text-dark" : "text-text-neutral-1-light dark:text-text-neutral-1-dark"}`}>
        {couldnt ? `${label} · Try again` : label}
      </span>
    </button>
  );
}
