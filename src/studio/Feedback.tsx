import { Icon } from "../components/Icon";
import { Thinking } from "../components/Thinking";
import type { Past } from "./history";
import type { NoticeAction, NoticeData } from "./failures";

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
      {past.backTo !== null && (
        <button type="button" onClick={onBack} className="type-caption-semibold shrink-0 whitespace-nowrap text-text-blue-1-light dark:text-text-blue-1-dark" data-name="back">
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
 * title, plain words and a way forward; Stopped is the words alone.
 */
export function Notice({ notice, onAction }: { notice: NoticeData; onAction: (action: NoticeAction) => void }) {
  const stopped = notice.kind === "Stopped";
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[6px]" data-name="gala-notice" data-kind={notice.kind}>
      <p className="type-caption-semibold shrink-0 whitespace-nowrap text-headline-1-light dark:text-headline-1-dark">Gala</p>
      <div className={`relative flex w-full shrink-0 flex-col items-start overflow-clip ${stopped ? "" : "gap-[12px] border-l-2 border-solid border-warning-400 pl-[14px]"}`} data-name="notice">
        {stopped ? (
          <p className="type-body-regular w-full shrink-0 text-text-neutral-1-light [word-break:break-word] dark:text-text-neutral-1-dark">{notice.say}</p>
        ) : (
          <>
            <p className="type-caption-semibold shrink-0 whitespace-nowrap text-text-neutral-2-light dark:text-text-neutral-2-dark">{notice.title}</p>
            <p className="type-body-regular w-full shrink-0 text-text-neutral-1-light [word-break:break-word] dark:text-text-neutral-1-dark">{notice.say}</p>
            <div className={`relative flex w-full shrink-0 flex-col items-start overflow-clip desktop:w-auto desktop:flex-row ${notice.actions.length > 1 ? "gap-[8px]" : ""}`} data-name="actions">
              {notice.actions.map((action, index) =>
                index === 0 ? (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => onAction(action)}
                    className="relative flex h-[40px] w-full shrink-0 items-center justify-center overflow-clip rounded-[12px] bg-button-1-default-light px-[20px] desktop:w-auto dark:bg-button-1-default-dark"
                    data-name="button-primary"
                  >
                    <span className="type-caption-semibold shrink-0 whitespace-nowrap text-button-light-text">{action.label}</span>
                  </button>
                ) : (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => onAction(action)}
                    className="relative flex h-[40px] w-full shrink-0 items-center justify-center overflow-clip rounded-[12px] border border-solid border-stroke-2-light px-[16px] desktop:w-auto dark:border-stroke-2-dark"
                    data-name="button-secondary"
                  >
                    <span className="type-caption-semibold shrink-0 whitespace-nowrap text-text-neutral-1-light dark:text-text-neutral-1-dark">{action.label}</span>
                  </button>
                ),
              )}
            </div>
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
