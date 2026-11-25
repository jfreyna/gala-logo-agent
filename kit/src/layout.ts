/**
 * Lays out the lock-ups from the traced mark and the outlined wordmark.
 *
 * Proportions are read from the `gala-kit` frame (Figma, FRI-1701), with the
 * mark's box as the unit:
 * - Primary: mark box 48, gap 10, type 22 (mark left, type right).
 * - Stacked: mark box 56, gap 6, type 16 (mark above, type below, centered).
 * - Icon: the mark alone. Wordmark: the type alone.
 * In the primary lock-up the type is centered on its cap height, so
 * descenders do not pull it off the mark's center line; its gap is
 * horizontal and measured from the glyphs' own left edge. In the stacked
 * lock-up the type hangs from its cap height and is pushed down when its
 * real ink would come closer to the mark than the gap. Every artwork is cropped tight to its ink; clear
 * space is a rule in the spec sheet, not padding in the file.
 *
 * The square (1024x1024) and the social image (1200x630) are not drawn in
 * the frames; their sizes and the 60% / 50% fill are gate-1 proposals.
 */

import type { SetText } from "./font.ts";
import { bounds, transform, unionBoxes, type Box, type Segment } from "./path.ts";
import type { TracedMark } from "./trace.ts";

export type Part = "mark" | "wordmark" | "ground";
export type Shape = { part: Part; segments: Segment[]; fillRule: "nonzero" | "evenodd" };
export type Artwork = { width: number; height: number; shapes: Shape[] };

/** The mark's box, in design units. */
const UNIT = 1000;

export const LOCKUP_RATIOS = {
  primary: { gap: 10 / 48, type: 22 / 48 },
  stacked: { gap: 6 / 56, type: 16 / 56 },
} as const;

export const SQUARE_SIZE = 1024;
export const SOCIAL_SIZE = { width: 1200, height: 630 } as const;
const SQUARE_FILL = 0.6;
const SOCIAL_FILL = { width: 0.6, height: 0.5 } as const;

/** The mark scaled so its longer side is one unit, ink box at the origin. */
function unitMark(mark: TracedMark): Shape {
  const b = bounds(mark.segments);
  const scale = UNIT / Math.max(b.width, b.height);
  return { part: "mark", segments: transform(mark.segments, scale, -b.x * scale, -b.y * scale), fillRule: mark.fillRule };
}

function place(shape: Shape, dx: number, dy: number, scale = 1): Shape {
  return { ...shape, segments: transform(shape.segments, scale, dx, dy) };
}

/** Moves every shape so the union of their ink starts at (0, 0). */
function crop(shapes: Shape[]): Artwork {
  const box = unionBoxes(shapes.map((s) => bounds(s.segments)));
  return { width: box.width, height: box.height, shapes: shapes.map((s) => place(s, -box.x, -box.y)) };
}

export type TypeSetter = (fontSize: number) => SetText;

export function primaryLockup(mark: TracedMark, setType: TypeSetter): Artwork {
  const m = unitMark(mark);
  const mb = bounds(m.segments);
  const markShape = place(m, 0, (UNIT - mb.height) / 2); // ink centered in its box
  const type = setType(UNIT * LOCKUP_RATIOS.primary.type);
  const tb = bounds(type.segments);
  const baseline = UNIT / 2 + type.capHeight / 2;
  const word: Shape = { part: "wordmark", segments: transform(type.segments, 1, mb.width + UNIT * LOCKUP_RATIOS.primary.gap - tb.x, baseline), fillRule: "nonzero" };
  return crop([markShape, word]);
}

export function stackedLockup(mark: TracedMark, setType: TypeSetter): Artwork {
  const m = unitMark(mark);
  const mb = bounds(m.segments);
  const markShape = place(m, -mb.width / 2, 0);
  const type = setType(UNIT * LOCKUP_RATIOS.stacked.type);
  const tb = bounds(type.segments);
  const gap = UNIT * LOCKUP_RATIOS.stacked.gap;
  // The name hangs from its cap height, the way the design draws it. But a
  // typeface can draw letters taller than the cap height it states, and
  // ascenders rise above capitals, so the gap is also held against the
  // glyphs' real top (`tb.y`, measured from the outlines, negative above the
  // baseline): the name moves down until its ink clears the mark by the gap.
  const baseline = mb.height + gap + Math.max(type.capHeight, -tb.y);
  const word: Shape = { part: "wordmark", segments: transform(type.segments, 1, -tb.x - tb.width / 2, baseline), fillRule: "nonzero" };
  return crop([markShape, word]);
}

export function iconArtwork(mark: TracedMark): Artwork {
  return crop([unitMark(mark)]);
}

export function wordmarkArtwork(setType: TypeSetter): Artwork {
  const type = setType(UNIT);
  return crop([{ part: "wordmark", segments: type.segments, fillRule: "nonzero" }]);
}

function rect(width: number, height: number): Segment[] {
  return [
    { op: "M", p: { x: 0, y: 0 } },
    { op: "L", p: { x: width, y: 0 } },
    { op: "L", p: { x: width, y: height } },
    { op: "L", p: { x: 0, y: height } },
    { op: "Z" },
  ];
}

/** Centers `art` in a canvas, scaled to fit the given box, on a ground. */
function onCanvas(art: Artwork, width: number, height: number, fitW: number, fitH: number): Artwork {
  const scale = Math.min(fitW / art.width, fitH / art.height);
  const dx = (width - art.width * scale) / 2;
  const dy = (height - art.height * scale) / 2;
  return {
    width,
    height,
    shapes: [{ part: "ground", segments: rect(width, height), fillRule: "nonzero" }, ...art.shapes.map((s) => place(s, dx, dy, scale))],
  };
}

export function squareArtwork(icon: Artwork): Artwork {
  return onCanvas(icon, SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE * SQUARE_FILL, SQUARE_SIZE * SQUARE_FILL);
}

export function socialArtwork(primary: Artwork): Artwork {
  const { width, height } = SOCIAL_SIZE;
  return onCanvas(primary, width, height, width * SOCIAL_FILL.width, height * SOCIAL_FILL.height);
}

export function inkBox(art: Artwork, part?: Part): Box {
  const shapes = part ? art.shapes.filter((s) => s.part === part) : art.shapes;
  return unionBoxes(shapes.map((s) => bounds(s.segments)));
}
