/**
 * The colorway's own files (FRI-1730): which variants each lock-up ships,
 * and the on-ground artwork.
 *
 * - On the ground: when the colorway's ground is a brand color (secondary
 *   or tertiary), every lock-up is also drawn on that ground, a filled
 *   rectangle behind the mark and the name with the clear space as its
 *   margin. The mark's knockouts are holes in its path (its fill rule), so
 *   they show the ground, never white.
 * - No copy: when the colorway's fills for a lock-up equal its all-black
 *   (or all-white) fills, the "color" files of that lock-up are left out;
 *   the all-black (or all-white) files are the colorway's files. Only the
 *   parts the artwork draws are compared: an icon is its mark alone.
 *
 * Reach (gate 3b): the clear space is measured on the file's own artwork,
 * the mark's height when it has a mark, else the name's. In the wordmark
 * file of a logo with a symbol the margin is therefore a share of the
 * name's height, not the mark's, because the mark is not in that file.
 */

import type { Artwork, Part, Shape } from "./layout.ts";
import { bounds, transform, unionBoxes, type Segment } from "./path.ts";
import type { Fills } from "./render.ts";

export type FileVariant = "color" | "black" | "white" | "ground";

/** The parts an artwork draws, apart from any ground of its own. */
function partsOf(art: Artwork): Part[] {
  return [...new Set(art.shapes.map((shape) => shape.part))].filter((part) => part !== "ground");
}

/** True when `a` and `b` paint every part of `art` the same. */
export function sameFills(art: Artwork, a: Fills, b: Fills): boolean {
  return partsOf(art).every((part) => a[part]?.toUpperCase() === b[part]?.toUpperCase());
}

/**
 * The variant whose files carry the colorway's fills for `art`: "color",
 * or the all-black or all-white variant when the colorway paints it the same.
 */
export function colorwayVariant(art: Artwork, fills: Record<"color" | "black" | "white", Fills>): "color" | "black" | "white" {
  if (sameFills(art, fills.color, fills.black)) return "black";
  if (sameFills(art, fills.color, fills.white)) return "white";
  return "color";
}

function rect(x: number, y: number, width: number, height: number): Segment[] {
  return [
    { op: "M", p: { x, y } },
    { op: "L", p: { x: x + width, y } },
    { op: "L", p: { x: x + width, y: y + height } },
    { op: "L", p: { x, y: y + height } },
    { op: "Z" },
  ];
}

/** The clear space for `art`: `ratio` of its mark's ink height, or of its name's when it has no mark. */
export function clearSpaceOf(art: Artwork, ratio: number): number {
  const of = (part: Part) => art.shapes.filter((shape) => shape.part === part);
  const basis = of("mark").length > 0 ? of("mark") : of("wordmark");
  if (basis.length === 0) return 0;
  return unionBoxes(basis.map((shape) => bounds(shape.segments))).height * ratio;
}

/** `art` on a ground: a filled rectangle with the clear space as its margin on every side, the artwork centered on it. */
export function onGround(art: Artwork, ratio: number): Artwork {
  const margin = clearSpaceOf(art, ratio);
  const width = art.width + margin * 2;
  const height = art.height + margin * 2;
  const ground: Shape = { part: "ground", segments: rect(0, 0, width, height), fillRule: "nonzero" };
  return { width, height, shapes: [ground, ...art.shapes.map((shape) => ({ ...shape, segments: transform(shape.segments, 1, margin, margin) }))] };
}
