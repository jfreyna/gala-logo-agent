/**
 * Writes an artwork as SVG, EPS or PNG. All three come from the same shapes.
 *
 * - SVG: one <path> per part, absolute coordinates, a <title>, nothing else.
 *   No <text>, fonts, images, styles or scripts.
 * - EPS: direct PostScript (EPSF-3.0) from the same geometry, RGB fills,
 *   `fill` or `eofill` matching each path's SVG fill rule. Read back by
 *   Ghostscript in scripts/verify-kit.ts; no converter runs at build time.
 * - PNG: the SVG rendered by resvg, transparent unless the artwork has a
 *   ground.
 *
 * Reach (gate 3b): the EPS is RGB, not CMYK, so a print shop converts it
 * with its own profile (the spec's CMYK values are a reference).
 */

import resvg from "@resvg/resvg-js";
import type { Artwork, Part } from "./layout.ts";
import { toPostScript, toSvgPathData, transform } from "./path.ts";
import { hexToRgb } from "./color.ts";

const { Resvg } = resvg;

export type Fills = Partial<Record<Part, string>>;

/** The natural size of a lock-up file: its longer side, in px (SVG) or pt (EPS). */
export const NATURAL_LONG_EDGE = 512;
/** Lock-up PNGs are rendered at this many px on the longer side. */
export const PNG_LONG_EDGE = 2048;

const round2 = (v: number) => Math.round(v * 100) / 100;

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

function fillFor(fills: Fills, part: Part): string {
  const fill = fills[part];
  if (fill === undefined) throw new Error(`kit: no fill for the ${part}`);
  return fill;
}

/** Display size for a file whose geometry is in design units. */
export function naturalSize(art: Artwork, longEdge = NATURAL_LONG_EDGE): { width: number; height: number } {
  const k = longEdge / Math.max(art.width, art.height);
  return { width: round2(art.width * k), height: round2(art.height * k) };
}

export function toSvg(art: Artwork, fills: Fills, title: string, size = naturalSize(art)): string {
  const paths = art.shapes.map((s) => {
    const rule = s.fillRule === "evenodd" ? ' fill-rule="evenodd"' : "";
    return `  <path fill="${fillFor(fills, s.part)}"${rule} d="${toSvgPathData(s.segments)}"/>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round2(art.width)} ${round2(art.height)}" width="${size.width}" height="${size.height}">`,
    `  <title>${escapeXml(title)}</title>`,
    ...paths,
    "</svg>",
    "",
  ].join("\n");
}

export function toEps(art: Artwork, fills: Fills, title: string): { text: string; width: number; height: number } {
  const { width, height } = naturalSize(art);
  const k = width / art.width;
  const body = art.shapes.map((s) => {
    const [r, g, b] = hexToRgb(fillFor(fills, s.part)).map((v) => Math.round((v / 255) * 10000) / 10000);
    const ps = toPostScript(transform(s.segments, k, 0, 0), height);
    return `${r} ${g} ${b} setrgbcolor\nnewpath\n${ps}\n${s.fillRule === "evenodd" ? "eofill" : "fill"}`;
  });
  const safeTitle = title.replace(/[^\x20-\x7e]/g, "?");
  const text = [
    "%!PS-Adobe-3.0 EPSF-3.0",
    `%%BoundingBox: 0 0 ${Math.ceil(width)} ${Math.ceil(height)}`,
    `%%HiResBoundingBox: 0 0 ${width} ${height}`,
    `%%Title: ${safeTitle}`,
    "%%Creator: Gala kit",
    "%%LanguageLevel: 2",
    "%%Pages: 1",
    "%%EndComments",
    "%%Page: 1 1",
    "save",
    "/m { moveto } bind def /l { lineto } bind def /c { curveto } bind def /h { closepath } bind def",
    ...body,
    "restore",
    "showpage",
    "%%EOF",
    "",
  ].join("\n");
  return { text, width, height };
}

/** Renders SVG text to PNG, `longEdge` px on the longer side (or the SVG's own size). */
export function toPng(svg: string, art: Artwork, longEdge?: number): { bytes: Uint8Array; width: number; height: number } {
  const fitTo = longEdge === undefined ? ({ mode: "original" } as const) : art.width >= art.height ? ({ mode: "width", value: longEdge } as const) : ({ mode: "height", value: longEdge } as const);
  const rendered = new Resvg(svg, { fitTo, font: { loadSystemFonts: false } }).render();
  return { bytes: new Uint8Array(rendered.asPng()), width: rendered.width, height: rendered.height };
}
