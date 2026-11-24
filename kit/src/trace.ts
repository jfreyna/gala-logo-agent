/**
 * Turns the chosen black-and-white mark into clean vector paths.
 *
 * 1. Sniff the format from the bytes (the `mime` is only a hint: Gemini has
 *    returned JPEG bytes under a .png name).
 * 2. Decode to RGBA. An SVG mark is rasterized first, so every mark leaves
 *    as plain paths whatever the SVG held (text, strokes, transforms).
 * 3. Flatten onto white, threshold at 50% luminance, and flip a white-on-black
 *    mark so the ink is always the dark side.
 * 4. Trace with Potrace (the JS port), dropping specks smaller than about
 *    0.002% of the image.
 *
 * Reach (gate 3b): this keeps the shape, not shades. A mark with grays or a
 * gradient is reduced to one flat silhouette at the 50% line, which is what a
 * black-and-white phase 2 mark should be; a soft or blurry mark will trace
 * with rounded corners. The assertions in scripts/verify-kit.ts check the
 * path count and bounds, not likeness to the source.
 */

import jpeg from "jpeg-js";
import pngjs from "pngjs";
import potrace from "potrace";
import resvg from "@resvg/resvg-js";
import { parsePath, subpathCount, transform, type Segment } from "./path.ts";

const { PNG } = pngjs;
const { Resvg } = resvg;

export type MarkFormat = "png" | "jpeg" | "svg";

export type Raster = { width: number; height: number; rgba: Uint8Array };

export type TracedMark = {
  segments: Segment[];
  fillRule: "evenodd";
  subpaths: number;
  source: { format: MarkFormat; width: number; height: number; inverted: boolean };
};

const MIN_SIDE = 64;
const MAX_PIXELS = 4096 * 4096;
const SVG_RASTER_SIDE = 1024;

export function sniffFormat(bytes: Uint8Array): MarkFormat {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).replace(/^﻿/, "").trimStart();
  if ((head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!--")) && head.includes("<svg")) return "svg";
  throw new Error("kit: the mark is not a PNG, JPEG or SVG");
}

export function decodeMark(bytes: Uint8Array): { raster: Raster; format: MarkFormat } {
  const format = sniffFormat(bytes);
  let raster: Raster;
  if (format === "png") {
    const png = PNG.sync.read(Buffer.from(bytes));
    raster = { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
  } else if (format === "jpeg") {
    const img = jpeg.decode(Buffer.from(bytes), { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 17, maxMemoryUsageInMB: 256 });
    raster = { width: img.width, height: img.height, rgba: new Uint8Array(img.data) };
  } else {
    const svg = new Resvg(Buffer.from(bytes), { fitTo: { mode: "width", value: SVG_RASTER_SIDE }, background: "white", font: { loadSystemFonts: false } });
    const png = PNG.sync.read(svg.render().asPng());
    raster = { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
  }
  if (Math.min(raster.width, raster.height) < MIN_SIDE) throw new Error(`kit: the mark is smaller than ${MIN_SIDE}px a side`);
  if (raster.width * raster.height > MAX_PIXELS) throw new Error("kit: the mark is larger than 4096x4096");
  return { raster, format };
}

/**
 * Flattens onto white and thresholds to pure black and white. When most of
 * the border is dark, the mark is white on black, so it is flipped.
 */
export function binarize(raster: Raster): { bits: Uint8Array; inverted: boolean } {
  const { width, height, rgba } = raster;
  const dark = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const a = rgba[i * 4 + 3]! / 255;
    const lum = 0.2126 * rgba[i * 4]! + 0.7152 * rgba[i * 4 + 1]! + 0.0722 * rgba[i * 4 + 2]!;
    const onWhite = lum * a + 255 * (1 - a);
    dark[i] = onWhite < 128 ? 1 : 0;
  }
  let border = 0;
  let borderDark = 0;
  for (let x = 0; x < width; x++) {
    borderDark += dark[x]! + dark[(height - 1) * width + x]!;
    border += 2;
  }
  for (let y = 0; y < height; y++) {
    borderDark += dark[y * width]! + dark[y * width + width - 1]!;
    border += 2;
  }
  const inverted = borderDark / border > 0.5;
  if (inverted) for (let i = 0; i < dark.length; i++) dark[i] = dark[i] ? 0 : 1;
  return { bits: dark, inverted };
}

function bitsToPng(bits: Uint8Array, width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < bits.length; i++) {
    const v = bits[i] ? 0 : 255;
    png.data[i * 4] = v;
    png.data[i * 4 + 1] = v;
    png.data[i * 4 + 2] = v;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

function potraceSvg(png: Buffer, turdSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    potrace.trace(
      png,
      { threshold: 128, blackOnWhite: true, turdSize, optCurve: true, optTolerance: 0.2, alphaMax: 1, color: "#000000", background: "transparent" },
      (err: Error | null, svg: string) => (err ? reject(err) : resolve(svg)),
    );
  });
}

/**
 * Surrounds the bitmap with a white margin. Ink that touches the image edge
 * otherwise traces with a zero-width sliver along the border.
 */
function pad(bits: Uint8Array, width: number, height: number, margin: number): { bits: Uint8Array; width: number; height: number } {
  const w = width + 2 * margin;
  const h = height + 2 * margin;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < height; y++) out.set(bits.subarray(y * width, (y + 1) * width), (y + margin) * w + margin);
  return { bits: out, width: w, height: h };
}

export async function traceMark(bytes: Uint8Array): Promise<TracedMark> {
  const { raster, format } = decodeMark(bytes);
  const { bits, inverted } = binarize(raster);
  if (!bits.includes(1)) throw new Error("kit: the mark is empty after thresholding");
  const margin = Math.max(8, Math.round(0.02 * Math.max(raster.width, raster.height)));
  const padded = pad(bits, raster.width, raster.height, margin);
  const turdSize = Math.max(2, Math.round((raster.width * raster.height) / 50000));
  const svg = await potraceSvg(bitsToPng(padded.bits, padded.width, padded.height), turdSize);
  const d = [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]).join(" ");
  // Back into the source image's coordinates.
  const segments = transform(parsePath(d), 1, -margin, -margin);
  const subpaths = subpathCount(segments);
  if (subpaths === 0) throw new Error("kit: tracing produced no paths");
  return { segments, fillRule: "evenodd", subpaths, source: { format, width: raster.width, height: raster.height, inverted } };
}
