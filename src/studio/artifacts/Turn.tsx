import type { ReactNode } from "react";

/**
 * The line Gala speaks above an artifact: the name, then the words. Every
 * artifact in the chat stream opens with one.
 */
export function Turn({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[6px]" data-name="turn">
      <p className="type-caption-semibold shrink-0 text-headline-1-light dark:text-headline-1-dark">Gala</p>
      <p className="type-body-regular w-full shrink-0 text-text-neutral-1-light [word-break:break-word] dark:text-text-neutral-1-dark">{children}</p>
    </div>
  );
}

/** The small capital label above or beside a value (BRAND, MOOD, PRIMARY). */
export function FieldLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`type-mini-semibold shrink-0 uppercase text-text-neutral-2-light dark:text-text-neutral-2-dark ${className}`}>{children}</p>
  );
}

/**
 * gala-filter-chip, Default state (Figma 5548:7011): a quiet outlined pill.
 * `tone` colors the label: the brief's "never" words read in the error color.
 */
export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "never" }) {
  return (
    <span className="relative flex shrink-0 items-start rounded-[999px] border border-solid border-stroke-2-light px-[10px] py-[4px] dark:border-stroke-2-dark" data-name="gala-filter-chip">
      <span
        className={`type-mini-semibold shrink-0 whitespace-nowrap ${
          tone === "never" ? "text-error-text-light dark:text-error-text-dark" : "text-text-neutral-2-light dark:text-text-neutral-2-dark"
        }`}
      >
        {children}
      </span>
    </span>
  );
}

/** The tinted card an artifact sits in. */
export function ArtifactCard({ children, name, gap = 16 }: { children: ReactNode; name: string; gap?: 12 | 16 }) {
  return (
    <div
      className={`relative flex w-full shrink-0 flex-col items-start rounded-[16px] bg-background-1-light p-[16px] dark:bg-background-2-dark ${gap === 12 ? "gap-[12px]" : "gap-[16px]"}`}
      data-name={name}
    >
      {children}
    </div>
  );
}
