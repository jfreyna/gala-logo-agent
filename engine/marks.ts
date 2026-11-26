/**
 * Marks: drawing one, turning it into clean vector paths, rendering it the
 * ways it will be tested, and judging the renders.
 *
 * The image model returns a raster. The kit's tracer turns it into paths,
 * and from then on every picture of the mark (the card, the test renders,
 * the colorways, the kit) is drawn from those paths in code. That is why a
 * colorway's colors are exact and why a mark on screen is always pure
 * black and white: the tracer can produce nothing else.
 */
import { iconArtwork } from "../kit/src/layout.ts";
import { toSvgPathData } from "../kit/src/path.ts";
import { rasterize } from "../kit/src/render.ts";
import { traceMark, type TracedMark } from "../kit/src/trace.ts";
import { draw, type Image } from "./gemini.ts";
import { ask, YES } from "./jev.ts";

export type Mark = {
  /** What the image model returned. Kept for the checks that judge the drawing itself, and as the kit's input. */
  source: Image;
  traced: TracedMark;
};

export async function drawMark(options: { prompt: string; from?: Image; step?: number; signal?: AbortSignal }): Promise<Mark> {
  const source = await draw(options);
  return { source, traced: await traceMark(source.bytes) };
}

export async function markFrom(source: Image): Promise<Mark> {
  return { source, traced: await traceMark(source.bytes) };
}

/** The mark alone, cropped to its ink, as SVG in one color on a clear ground. */
export function markSvg(mark: Mark, fill = "#000000"): string {
  const art = iconArtwork(mark.traced);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${art.width} ${art.height}">${paths(mark, fill)}</svg>`;
}

function paths(mark: Mark, fill: string): string {
  return iconArtwork(mark.traced)
    .shapes.map((shape) => `<path fill="${fill}"${shape.fillRule === "evenodd" ? ' fill-rule="evenodd"' : ""} d="${toSvgPathData(shape.segments)}"/>`)
    .join("");
}

/** The mark centered on a square canvas, filling `share` of it. */
function onSquare(mark: Mark, options: { fill: string; ground: string; share: number; clip?: "circle" }): string {
  const art = iconArtwork(mark.traced);
  const size = 512;
  const scale = (size * options.share) / Math.max(art.width, art.height);
  const dx = (size - art.width * scale) / 2;
  const dy = (size - art.height * scale) / 2;
  const ground =
    options.clip === "circle"
      ? `<rect width="${size}" height="${size}" fill="#9A9A9A"/><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 16}" fill="${options.ground}"/>`
      : `<rect width="${size}" height="${size}" fill="${options.ground}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${ground}<g transform="translate(${dx} ${dy}) scale(${scale})">${paths(mark, options.fill)}</g></svg>`;
}

const png = (bytes: Uint8Array): Image => ({ bytes, mime: "image/png" });

/**
 * The renders a mark is judged on. TypeSafe refuses images under 280px a
 * side and bills by size, so every render is 512px, except the 16px test,
 * which is drawn at 16px and then enlarged pixel for pixel to 320px: the
 * judge sees exactly the pixels a favicon would have.
 */
export function renders(mark: Mark): { drawing: Image; small: Image; round: Image; dark: Image; large: Image } {
  const plain = onSquare(mark, { fill: "#000000", ground: "#FFFFFF", share: 0.8 });
  const tiny = Buffer.from(rasterize(plain, 16)).toString("base64");
  const enlarged = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 16 16"><image width="16" height="16" image-rendering="optimizeSpeed" xlink:href="data:image/png;base64,${tiny}"/></svg>`;
  // The drawing itself, as the image model made it, scaled down for the judge.
  const original = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512"><rect width="512" height="512" fill="#FFFFFF"/><image width="512" height="512" xlink:href="data:${mark.source.mime};base64,${Buffer.from(mark.source.bytes).toString("base64")}"/></svg>`;
  return {
    drawing: png(rasterize(original, 512)),
    small: png(rasterize(enlarged, 320)),
    round: png(rasterize(onSquare(mark, { fill: "#000000", ground: "#FFFFFF", share: 0.62, clip: "circle" }), 512)),
    dark: png(rasterize(onSquare(mark, { fill: "#FFFFFF", ground: "#000000", share: 0.8 }), 512)),
    // Poster size: the middle of the mark at twice the scale, where rough edges show.
    large: png(rasterize(onSquare(mark, { fill: "#000000", ground: "#FFFFFF", share: 1.6 }), 512)),
  };
}

/**
 * The three real-world questions, asked the same way of a draft (for its
 * badges) and of the chosen mark (in the stress test), so the two agree as
 * far as one model's reading can.
 */
const REAL_WORLD = {
  sixteen: { type: "noul", instructions: "`small` is `mark` drawn at 16 pixels and enlarged. Is its shape still clear enough to recognise?" },
  circle: { type: "noul", instructions: "`round` shows `mark` inside a circular avatar. Does the mark sit well in the circle, without looking small, lost or crowded?" },
  inverted: { type: "noul", instructions: "`dark` shows `mark` in white on black. Does it read clearly, with no part closing up or disappearing?" },
} as const;

/** What a draft is judged against: the approved direction and the competitors found in research. */
export type DraftContext = { direction: unknown; competitors: unknown; competitorImages?: Image[] };

/** What Jev found in one draft. */
export type Judgement = {
  /** Reasons the draft can't be shown as an option. Empty when it can. */
  rejected: string[];
  /** The badges on a concept card: does it hold at 16px, in a circle, inverted. */
  sixteen: boolean;
  circle: boolean;
  inverted: boolean;
};

/**
 * The reason shown when a draft is set aside, per check. A draft Gala
 * rejects stays on the board with its reason; it is not hidden.
 */
const REJECTION = {
  pureBlackAndWhite: "Not pure black and white",
  noLettering: "Stray lettering in the mark",
  distinct: "Too close to a competitor’s mark",
  fitsDirection: "Off the direction",
} as const;

/**
 * Judges a draft against the brief's direction and the competitors found
 * in research.
 *
 * "Distinct" compares the drawing with the competitors' own site icons,
 * fetched in research, as images, alongside the written descriptions of
 * their logos. What this does not prove: a site icon is often an app icon,
 * not the full logo, and where a site gave none only the description is
 * compared. It is not a trademark search. The 16px, circle and inverted answers are one
 * model's reading of one render each.
 */
export async function judgeDraft(mark: Mark, context: DraftContext, signal?: AbortSignal): Promise<Judgement> {
  const images = renders(mark);
  const theirs = Object.fromEntries((context.competitorImages ?? []).map((image, index) => [`competitor${index + 1}`, image]));
  const shown = Object.keys(theirs).map((key) => `\`${key}\``).join(", ");
  const answers = await ask({
    state: { direction: context.direction, competitors: context.competitors },
    images: { mark: images.drawing, small: images.small, round: images.round, dark: images.dark, ...theirs },
    questions: {
      pureBlackAndWhite: { type: "noul", instructions: "Is `mark` drawn only in solid black on a white background, with no colour, gradients or grey shading?" },
      lettering: { type: "noul", instructions: "Does `mark` contain any letters, words or numbers?" },
      tooClose: {
        type: "noul",
        instructions:
          shown === ""
            ? "Would `mark` be mistaken for the logo of one of the brands described in `competitors`?"
            : `Would \`mark\` be mistaken for the logo of one of the brands described in \`competitors\`, whose own site icons are ${shown}?`,
      },
      fitsDirection: { type: "noul", instructions: "Does `mark` fit the mood, posture and energy described in `direction`?" },
      ...REAL_WORLD,
    },
    signal,
  });
  const rejected: string[] = [];
  if (answers.pureBlackAndWhite.noul < YES) rejected.push(REJECTION.pureBlackAndWhite);
  if (answers.lettering.noul >= YES) rejected.push(REJECTION.noLettering);
  if (answers.tooClose.noul >= YES) rejected.push(REJECTION.distinct);
  if (answers.fitsDirection.noul < YES) rejected.push(REJECTION.fitsDirection);
  return { rejected, sixteen: answers.sixteen.noul >= YES, circle: answers.circle.noul >= YES, inverted: answers.inverted.noul >= YES };
}

/** The four stress tests on the chosen mark. */
export async function stressTest(mark: Mark, signal?: AbortSignal): Promise<{ sixteen: boolean; circle: boolean; inverted: boolean; poster: boolean }> {
  const images = renders(mark);
  const answers = await ask({
    state: {},
    images: { mark: images.drawing, small: images.small, round: images.round, dark: images.dark, large: images.large },
    questions: {
      ...REAL_WORLD,
      poster: { type: "noul", instructions: "`large` shows the middle of `mark` at poster size. Are its edges clean, with no rough outlines or stray specks?" },
    },
    signal,
  });
  return { sixteen: answers.sixteen.noul >= YES, circle: answers.circle.noul >= YES, inverted: answers.inverted.noul >= YES, poster: answers.poster.noul >= YES };
}

/** A drawing as the judge sees it: the image model's output on white, at 512px. */
export function judgeView(source: Image): Image {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512"><rect width="512" height="512" fill="#FFFFFF"/><image width="512" height="512" xlink:href="data:${source.mime};base64,${Buffer.from(source.bytes).toString("base64")}"/></svg>`;
  return png(rasterize(svg, 512));
}

/**
 * Each new drawing against what the person asked for and against the mark
 * it started from: does it show the request, and is it a different mark
 * from its start? Gala's line about a round is written from these answers,
 * so it describes the drawings, never only the request. A question is
 * asked only when there is something to compare with: no request, no
 * `showsRequest`; no starting mark, no `differsFromStart`.
 *
 * What this does not prove: each answer is one model's reading of two
 * pictures. A small change (a bar moved a few pixels) can read as "the
 * same", and a different mark that ignores the request can still read as
 * different, which is why both are asked.
 */
export async function compareDrawing(drawing: Image, options: { request: string[] | null; start: Image | null; signal?: AbortSignal }): Promise<{ showsRequest: boolean | null; differsFromStart: boolean | null }> {
  if (options.request === null && options.start === null) return { showsRequest: null, differsFromStart: null };
  const answers = (await ask({
    state: { ...(options.request !== null ? { request: options.request } : {}) },
    images: { drawing: judgeView(drawing), ...(options.start !== null ? { start: judgeView(options.start) } : {}) },
    questions: {
      ...(options.request !== null ? { showsRequest: { type: "noul", instructions: "`request` is what the person asked to see or change in the mark. Does `drawing` show it?" } as const } : {}),
      ...(options.start !== null ? { differsFromStart: { type: "noul", instructions: "`drawing` was drawn starting from `start`. Is it visibly a different mark from `start`, beyond small differences in the edges? Answer no if the shapes are the same." } as const } : {}),
    },
    signal: options.signal,
  })) as Record<string, { noul: number } | undefined>;
  return {
    showsRequest: answers.showsRequest === undefined ? null : answers.showsRequest.noul >= YES,
    differsFromStart: answers.differsFromStart === undefined ? null : answers.differsFromStart.noul >= YES,
  };
}
