import { useState } from "react";

export type HallKind = "fame" | "shame";

export type HallEntry = {
  id: string;
  brandName: string;
  /** The mark in its real colors. */
  markUrl: string | null;
  /** The person's words, when they wrote some and they passed the check. */
  quote: string | null;
  /** Shows the tile open, as if hovered. Used by the dev preview only. */
  pinnedOpen?: boolean;
};

/**
 * Paints any mark one flat color, whatever its own colors are: the filter
 * keeps the mark's shape and floods it with the tint. Rendered once per page.
 * The two tints are text-neutral-2 in light and in dark.
 */
export function HallTintFilters() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <filter id="hall-tint-light" colorInterpolationFilters="sRGB">
        <feFlood floodColor="#8db3c4" />
        <feComposite in2="SourceAlpha" operator="in" />
      </filter>
      <filter id="hall-tint-dark" colorInterpolationFilters="sRGB">
        <feFlood floodColor="#6c97aa" />
        <feComposite in2="SourceAlpha" operator="in" />
      </filter>
    </svg>
  );
}

/**
 * gala-hall-tile (Figma 5555:9385). At rest: the mark tinted, and the brand
 * under it. Hovered or focused: a card with the mark in its real colors on
 * white paper, the brand, the verdict, and the first line of the quote.
 * Pressing it opens the full view.
 */
export function HallTile({ entry, kind, onOpen }: { entry: HallEntry; kind: HallKind; onOpen: () => void }) {
  const [hovered, setActive] = useState(false);
  const active = hovered || entry.pinnedOpen === true;
  const verdict = kind === "fame" ? "Picked as best" : "Picked as worst";

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      aria-label={`${entry.brandName}. ${verdict}.`}
      className={
        active
          ? "relative flex w-[264px] shrink-0 flex-col items-start gap-[8px] rounded-[16px] border border-solid border-stroke-1-light bg-background-1-light p-[12px] text-left drop-shadow-[0px_8px_12px_rgba(0,0,0,0.12)] dark:border-stroke-1-dark dark:bg-background-2-dark"
          : "relative flex w-[152px] shrink-0 flex-col items-center gap-[8px]"
      }
      data-name="gala-hall-tile"
    >
      <span
        className={`relative flex shrink-0 items-center justify-center overflow-clip rounded-[12px] ${active ? "h-[140px] w-full bg-neutral-0" : "size-[120px]"}`}
        data-name="art"
      >
        {entry.markUrl !== null &&
          (active ? (
            <img alt="" src={entry.markUrl} className="size-[96px] shrink-0 object-contain" />
          ) : (
            <img
              alt=""
              src={entry.markUrl}
              className="size-[88px] shrink-0 object-contain [filter:url(#hall-tint-light)] dark:[filter:url(#hall-tint-dark)]"
            />
          ))}
      </span>
      {active ? (
        <>
          <span className="relative flex w-full shrink-0 items-center justify-between overflow-clip whitespace-nowrap" data-name="meta">
            <span className="type-caption-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">{entry.brandName}</span>
            <span
              className={`type-mini-semibold shrink-0 ${kind === "shame" ? "text-error-text-light dark:text-error-text-dark" : "text-text-green-1-light dark:text-text-green-1-dark"}`}
            >
              {verdict}
            </span>
          </span>
          {entry.quote !== null && (
            <span className="type-caption-medium relative block w-full shrink-0 overflow-hidden text-ellipsis whitespace-nowrap indent-[-6.3px] text-text-neutral-1-light dark:text-text-neutral-1-dark">
              {entry.quote}
            </span>
          )}
        </>
      ) : (
        <span className="type-mini-medium shrink-0 whitespace-nowrap text-text-blue-1-light dark:text-text-blue-1-dark">{entry.brandName}</span>
      )}
    </button>
  );
}
