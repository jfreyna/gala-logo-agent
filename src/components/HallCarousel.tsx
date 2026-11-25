import { HallTile, type HallEntry, type HallKind } from "./HallTile";

const COPY: Record<HallKind, { title: string; line: string }> = {
  fame: { title: "Hall of fame", line: "The logos people chose, and why they loved them." },
  shame: { title: "Hall of shame", line: "The drafts people liked least, and why. Every studio has a reject pile." },
};

/** How fast a row rolls, in pixels per second. Slow enough to read. */
const PIXELS_PER_SECOND = 28;
/** One tile's width plus the gap after it. */
const TILE_STRIDE = 152 + 16;
/** A row needs at least this many tiles to fill a wide screen before it repeats. */
const MIN_TILES_PER_LAP = 14;

/**
 * gala-hall-carousel (Figma 5557:9925). The row rolls slowly and without
 * end, fame to the left and shame to the right. It pauses while the pointer
 * is over it or a tile has focus, and stands still when the visitor's system
 * asks for reduced motion. The edges fade out.
 */
export function HallCarousel({
  kind,
  entries,
  onOpen,
}: {
  kind: HallKind;
  entries: HallEntry[];
  onOpen: (entry: HallEntry) => void;
}) {
  const copy = COPY[kind];

  // One lap is the entries repeated until they fill a wide screen. The track
  // holds two laps, and the animation slides exactly one lap, so the loop
  // has no seam.
  const repeats = entries.length === 0 ? 0 : Math.ceil(MIN_TILES_PER_LAP / entries.length);
  const lap = Array.from({ length: repeats }, () => entries).flat();
  const seconds = (lap.length * TILE_STRIDE) / PIXELS_PER_SECOND;

  return (
    <section className="relative flex w-full flex-col items-start gap-[16px] overflow-clip" data-name="gala-hall-carousel">
      <div className="relative flex w-full shrink-0 flex-col items-start overflow-clip px-[16px] desktop:px-[120px]" data-name="heading">
        <h2 className="shrink-0 whitespace-nowrap font-headings text-[28px] font-bold leading-[normal] text-headline-1-light desktop:text-[36px] dark:text-headline-1-dark">
          {copy.title}
        </h2>
        <p className="type-body-regular shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{copy.line}</p>
      </div>
      <div
        className="hall-strip relative flex min-h-[187px] w-full shrink-0 items-start overflow-clip border-y border-solid border-stroke-1-light py-[20px] dark:border-stroke-1-dark"
        data-name="tiles"
      >
        <div
          className={`hall-track flex w-max items-start ${kind === "fame" ? "hall-track-left" : "hall-track-right"}`}
          style={{ animationDuration: `${seconds}s` }}
        >
          {[0, 1].map((lapIndex) => (
            <div key={lapIndex} className="flex shrink-0 items-start gap-[16px] pr-[16px]" aria-hidden={lapIndex === 1}>
              {lap.map((entry, index) => (
                <HallTile key={`${entry.id}-${index}`} entry={entry} kind={kind} onOpen={() => onOpen(entry)} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
