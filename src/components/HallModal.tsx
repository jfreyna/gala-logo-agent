import { useEffect, useRef } from "react";
import type { HallEntry, HallKind } from "./HallTile";
import closeLight from "../assets/icons/close-light.svg";
import closeDark from "../assets/icons/close-dark.svg";

/**
 * gala-hall-modal (Figma 5561:11115): the full view of a hall entry. A
 * centered 560 modal over a scrim on desktop, a bottom sheet on a phone.
 * It closes with the X, Escape, or a press on the scrim.
 */
export function HallModal({ entry, kind, onClose }: { entry: HallEntry; kind: HallKind; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  const title = kind === "fame" ? "Hall of fame" : "Hall of shame";
  const verdict = kind === "fame" ? "Picked as best" : "Picked as worst";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(2,28,41,0.55)] desktop:items-center"
      onClick={onClose}
      data-name="scrim"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title}: ${entry.brandName}`}
        onClick={(event) => event.stopPropagation()}
        className="relative flex w-full flex-col items-start gap-[16px] rounded-t-[16px] border border-solid border-stroke-1-light bg-background-2-light px-[16px] pb-[32px] pt-[16px] drop-shadow-[0px_16px_24px_rgba(0,0,0,0.2)] desktop:w-[560px] desktop:rounded-[16px] desktop:p-[24px] dark:border-stroke-1-dark dark:bg-background-1-dark"
        data-name="gala-hall-modal"
      >
        <div className="relative flex w-full shrink-0 items-center justify-between overflow-clip" data-name="top">
          <p className="shrink-0 whitespace-nowrap font-headings text-[20px] font-bold leading-[normal] text-headline-2-light dark:text-headline-2-dark">
            {title}
          </p>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="relative flex size-[36px] shrink-0 items-center justify-center overflow-clip rounded-[8px]"
            data-name="close"
          >
            <img alt="" src={closeLight} width={20} height={20} className="size-[20px] shrink-0 dark:hidden" />
            <img alt="" src={closeDark} width={20} height={20} className="hidden size-[20px] shrink-0 dark:block" />
          </button>
        </div>
        <div
          className="relative flex h-[240px] w-full shrink-0 items-center justify-center overflow-clip rounded-[12px] bg-neutral-0 desktop:h-[300px]"
          data-name="art"
        >
          {entry.markUrl !== null && (
            <img alt={`${entry.brandName} logo`} src={entry.markUrl} className="size-[180px] shrink-0 object-contain desktop:size-[220px]" />
          )}
        </div>
        <div className="relative flex w-full shrink-0 items-center justify-between overflow-clip whitespace-nowrap" data-name="meta">
          <p className="type-caption-semibold shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{entry.brandName}</p>
          <p
            className={`type-mini-semibold shrink-0 ${kind === "shame" ? "text-error-text-light dark:text-error-text-dark" : "text-text-green-1-light dark:text-text-green-1-dark"}`}
          >
            {verdict}
          </p>
        </div>
        {entry.quote !== null && (
          <p className="type-body-regular relative w-full shrink-0 indent-[-7.2px] text-text-neutral-1-light [word-break:break-word] dark:text-text-neutral-1-dark">
            {entry.quote}
          </p>
        )}
      </div>
    </div>
  );
}
