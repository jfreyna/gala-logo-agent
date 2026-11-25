import type { ReactNode } from "react";
import { Thinking } from "../components/Thinking";

/**
 * gala-message (Figma 5527:2752): Gala's lines sit flush left under the
 * name; the visitor's sit in a bubble on the right; "working" is a quiet
 * status line with three dots.
 */
export function GalaMessage({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[6px]" data-name="gala-message">
      <p className="type-caption-semibold shrink-0 text-headline-1-light dark:text-headline-1-dark">Gala</p>
      <div className="type-body-regular w-full shrink-0 whitespace-pre-wrap text-text-neutral-1-light [word-break:break-word] dark:text-text-neutral-1-dark">
        {children}
      </div>
    </div>
  );
}

export function VisitorMessage({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex w-full shrink-0 items-start justify-end pl-[48px]" data-name="gala-message">
      <div className="relative flex max-w-[480px] items-start overflow-clip rounded-[8px] bg-background-1-light px-[16px] py-[12px] dark:bg-background-2-dark" data-name="bubble">
        <div className="type-body-regular min-w-px whitespace-pre-wrap text-text-neutral-1-light [word-break:break-word] dark:text-text-neutral-1-dark">
          {children}
        </div>
      </div>
    </div>
  );
}

export function WorkingMessage({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[6px]" data-name="gala-message" role="status">
      <div className="relative flex shrink-0 items-center gap-[8px] overflow-clip" data-name="status">
        <Thinking className="text-text-neutral-2-light dark:text-text-neutral-2-dark" />
        <p className="type-caption-medium shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">{children}</p>
      </div>
    </div>
  );
}
