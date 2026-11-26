import { useState } from "react";

export type HallKind = "fame" | "shame";

export type HallEntry = {
  id: string;
  brandName: string;
  /** The mark in its real colors. */
  markUrl: string | null;
  /** The person's words, when they wrote some and they passed the check. */
  quote: string | null;
  /** Shows the tile as if hovered: the mark in its real colors. Used by the dev preview only. */
  pinnedHover?: boolean;
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
 * gala-hall-tile (Figma 5555:9385). The mark tinted, and the brand under it.
 * Hovered or focused, the tile keeps its size and place and only the mark
 * shows its real colors, so the row never moves. Pressing it opens the full
 * view.
 */
export function HallTile({ entry, kind, onOpen }: { entry: HallEntry; kind: HallKind; onOpen: () => void }) {
  const [hovered, setActive] = useState(false);
  const active = hovered || entry.pinnedHover === true;
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
      className="relative flex w-[152px] shrink-0 flex-col items-center gap-[8px]"
      data-name="gala-hall-tile"
      data-state={active ? "hover" : "default"}
    >
      <span className="relative flex size-[120px] shrink-0 items-center justify-center overflow-clip rounded-[12px]" data-name="art">
        {entry.markUrl !== null && (
          <img
            alt=""
            src={entry.markUrl}
            className={`size-[88px] shrink-0 object-contain ${active ? "" : "[filter:url(#hall-tint-light)] dark:[filter:url(#hall-tint-dark)]"}`}
            data-name="mark"
          />
        )}
      </span>
      <span className="type-mini-medium shrink-0 whitespace-nowrap text-text-blue-1-light dark:text-text-blue-1-dark">{entry.brandName}</span>
    </button>
  );
}
