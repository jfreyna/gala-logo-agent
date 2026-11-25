import { Icon } from "../components/Icon";
import { Thinking } from "../components/Thinking";
import type { Past } from "./history";

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
