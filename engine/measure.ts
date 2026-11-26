/**
 * Measuring a drawing against a request about where a part sits or how big
 * it is (FRI-1725).
 *
 * FRI-1719 asks Jev two yes/no questions per drawing: does it show the
 * request, and does it differ from its start. For "shift the bottom bar
 * left by half a unit" a yes/no is one model's impression of two pictures,
 * and the Half Step walk showed it can miss a bar that never moved. Here
 * Jev boxes the part the request names in the starting mark and in each
 * new drawing, and code compares the edges.
 *
 *   1. `readWant`: is the request about a part's position or size, and
 *      which way? A Jev choice on the person's words, never a word list.
 *   2. `boxPart`: a `box` and a presence `noul` for the start and for each
 *      drawing, one Jev request per image, each image boxed a few times. The part is named through the
 *      request itself, so Jev reads it from the person's words in every
 *      image the same way.
 *   3. `compareBoxes`: code only. Moved which way and roughly how far;
 *      grew or shrank.
 *
 * Any failure (Jev errors or is refused, a box is unsure, the part is not
 * there) gives back null for that drawing, and the caller keeps FRI-1719's
 * yes/no answers. Nothing here can fail a turn.
 *
 * What this does not prove: each box is one model's reading of one
 * picture, and a tolerance is a judgment. A move smaller than the
 * tolerance reads as unmoved; a part Jev boxes wrongly in both pictures
 * measures wrongly in both.
 */
import type { Image } from "./gemini.ts";
import { ask, SURE, YES, type Edges } from "./jev.ts";

export type Direction = "left" | "right" | "up" | "down";
export type SizeWay = "bigger" | "smaller";

/** What a request asks of one part: to move it (which way, if said), or to resize it (which way, if said). */
export type Want = { kind: "move"; direction: Direction | null } | { kind: "resize"; way: SizeWay | null };

/** One part's box in one picture, and whether Jev can stand behind it. */
export type Reading = { edges: Edges; usable: boolean; confidence: number };

/** What the edges say happened to the part between the start and a drawing. */
export type Measured = {
  /** The larger shift past the tolerance, and how far as a share of the part's own size on that axis (0.5 is about half its width). */
  moved: { direction: Direction; by: number } | null;
  resized: SizeWay | null;
  /** The part did what the request asked. */
  meets: boolean;
  /** The part measurably moved or resized. */
  changed: boolean;
};

/**
 * The tolerance, in fractions of the image side (the drawings are judged
 * at 512px, so 0.01 is about 5px). Set from what a box resolves, measured
 * on the Sprite on Nov 25 with bars drawn in code, one image per request:
 *
 * - the same picture boxed again lands within about 0.005 of itself;
 * - a box reads a move at roughly half its true distance (a 60px shift,
 *   0.12 of the image, read as 0.05 to 0.065; a 30px one as 0.025);
 * - a bar made 0.12 longer read about 0.11 wider.
 *
 * So a move counts when the part's center shifts by more than `MOVE_FLOOR`
 * on an axis (four times the wander seen, about 20px of true movement),
 * and a resize when its width or height changes by more than `SIZE_FLOOR`
 * (two edges, each free to wander), with neither shrinking past it the
 * other way. Absolute, not a share of the part's size: a half-step move of
 * a wide bar is a small share of its width but a clear distance on the
 * page. A move under about 20px can read as unmoved; that is the price of
 * never calling noise a move. The check boxes the same picture several
 * times and asserts the wander stays inside both.
 */
export const MOVE_FLOOR = 0.02;
export const SIZE_FLOOR = 0.04;

/** The choices a request is read with. Each criterion is a meaning, not a phrase to match. */
const WANT_QUESTIONS = {
  kind: {
    type: "choice",
    instructions: "`request` is what the person asked to change in a drawn mark. What does it ask for?",
    criteria: {
      move: "To move one part of the mark: change where that part sits, without asking for anything else",
      resize: "To make one part of the mark bigger or smaller (longer, shorter, wider, narrower, taller), without asking for anything else",
      neither: "Anything else: a different shape, a style, more than one change, or a change to the whole mark",
    },
  },
  direction: {
    type: "choice",
    instructions: "If `request` asks to move a part of the mark, which way should it go on the page?",
    criteria: { left: "Toward the left", right: "Toward the right", up: "Toward the top", down: "Toward the bottom", notStated: "No way is said, or it is not a move" },
  },
  sizeWay: {
    type: "choice",
    instructions: "If `request` asks to change the size of a part of the mark, which way?",
    criteria: { bigger: "Bigger, longer, wider or taller", smaller: "Smaller, shorter, narrower or lower", notStated: "No way is said, or it is not about size" },
  },
} as const;

/** Whether `request` is about one part's position or size, and which way. Null when it is neither, or Jev is unsure. */
export async function readWant(request: string, signal?: AbortSignal): Promise<Want | null> {
  const answers = await ask({ state: { request }, questions: WANT_QUESTIONS, signal });
  if (answers.kind.confidence < SURE) return null;
  const sure = <T extends string>(answer: { choice: string; confidence: number }, values: readonly T[]): T | null =>
    answer.confidence >= SURE && (values as readonly string[]).includes(answer.choice) ? (answer.choice as T) : null;
  if (answers.kind.choice === "move") return { kind: "move", direction: sure(answers.direction, ["left", "right", "up", "down"] as const) };
  if (answers.kind.choice === "resize") return { kind: "resize", way: sure(answers.sizeWay, ["bigger", "smaller"] as const) };
  return null;
}

const valid = (edges: Edges | undefined): edges is Edges =>
  edges !== undefined && [edges.top, edges.bottom, edges.left, edges.right].every((value) => typeof value === "number" && value >= 0 && value <= 1) && edges.left < edges.right && edges.top < edges.bottom;

/** How many times each picture is boxed. */
export const SAMPLES = 3;

const center = (edges: Edges) => ({ x: (edges.left + edges.right) / 2, y: (edges.top + edges.bottom) / 2, w: edges.right - edges.left, h: edges.bottom - edges.top });
const median = (values: number[]) => [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)]!;

/**
 * The part `request` names, boxed in the start and in each drawing, with a
 * presence question beside each box.
 *
 * One Jev request per image: with several images in one request the boxes
 * came back nearly the same for every image. And each image is boxed
 * `SAMPLES` times, because one box can land on the wrong part (on the
 * Nov 25 probe, the same picture boxed twice once came back 0.13 apart,
 * the second box taking in two bars). The reading is the median of each
 * edge, and it is usable only when the part is there (median presence at
 * `YES`) and a majority of the samples agree with the median within the
 * tolerance. A picture Jev can't box the same way twice falls back to
 * FRI-1719's yes/no answers, rather than being measured wrongly.
 *
 * Box confidence is logged, not gated: on clean bars it ran 0.1 to 0.5
 * with no link to how close the box was, and TypeSafe gives no threshold.
 */
export async function boxPart(request: string, start: Image, drawings: Image[], signal?: AbortSignal): Promise<{ start: Reading; drawings: Reading[] }> {
  const sample = async (image: Image) => {
    const answers = await ask({
      state: { request },
      images: { image },
      questions: {
        part: { type: "box", instructions: "The part of the mark in `image` that `request` asks to move or resize." },
        present: { type: "noul", instructions: "Does `image` contain the part of the mark that `request` asks to move or resize?" },
      },
      signal,
    });
    return { edges: answers.part?.box, confidence: answers.part?.confidence ?? 0, present: answers.present?.noul ?? 0 };
  };
  const read = async (image: Image): Promise<Reading> => {
    const samples = await Promise.all(Array.from({ length: SAMPLES }, () => sample(image)));
    const boxes = samples.map((entry) => entry.edges).filter(valid);
    const nothing: Reading = { edges: { top: 0, bottom: 1, left: 0, right: 1 }, usable: false, confidence: 0 };
    if (boxes.length === 0) return nothing;
    const edges: Edges = {
      top: median(boxes.map((entry) => entry.top)),
      bottom: median(boxes.map((entry) => entry.bottom)),
      left: median(boxes.map((entry) => entry.left)),
      right: median(boxes.map((entry) => entry.right)),
    };
    const middle = center(edges);
    const agreeing = boxes.filter((entry) => {
      const c = center(entry);
      return Math.abs(c.x - middle.x) <= MOVE_FLOOR && Math.abs(c.y - middle.y) <= MOVE_FLOOR && Math.abs(c.w - middle.w) <= SIZE_FLOOR && Math.abs(c.h - middle.h) <= SIZE_FLOOR;
    }).length;
    const present = median(samples.map((entry) => entry.present));
    return { edges, usable: present >= YES && agreeing * 2 > SAMPLES, confidence: median(samples.map((entry) => entry.confidence)) };
  };
  const [first, ...rest] = await Promise.all([start, ...drawings].map(read));
  return { start: first!, drawings: rest };
}

/** What happened to the part between `before` and `after`, judged against `want`. Code only. */
export function compareBoxes(before: Edges, after: Edges, want: Want): Measured {
  const width = before.right - before.left;
  const height = before.bottom - before.top;
  const dx = (after.left + after.right) / 2 - (before.left + before.right) / 2;
  const dy = (after.top + after.bottom) / 2 - (before.top + before.bottom) / 2;
  const went: Record<Direction, boolean> = { left: dx < -MOVE_FLOOR, right: dx > MOVE_FLOOR, up: dy < -MOVE_FLOOR, down: dy > MOVE_FLOOR };
  const alongX = went.left || went.right;
  const alongY = went.up || went.down;
  // When both axes moved, name the one that moved further.
  const moved =
    alongX && (!alongY || Math.abs(dx) >= Math.abs(dy))
      ? { direction: (dx < 0 ? "left" : "right") as Direction, by: Math.abs(dx) / width }
      : alongY
        ? { direction: (dy < 0 ? "up" : "down") as Direction, by: Math.abs(dy) / height }
        : null;
  const dw = after.right - after.left - width;
  const dh = after.bottom - after.top - height;
  const resized: SizeWay | null =
    Math.max(dw, dh) > SIZE_FLOOR && Math.min(dw, dh) > -SIZE_FLOOR ? "bigger" : Math.min(dw, dh) < -SIZE_FLOOR && Math.max(dw, dh) < SIZE_FLOOR ? "smaller" : null;
  const meets = want.kind === "move" ? (want.direction === null ? moved !== null : went[want.direction]) : want.way === null ? resized !== null : resized === want.way;
  return { moved, resized, meets, changed: moved !== null || resized !== null };
}

/**
 * The whole measurement for one round: null for the round when the
 * request is not about a part's position or size, or when Jev fails; null
 * for a drawing whose box (or the start's) can't be used. The caller keeps
 * FRI-1719's yes/no answers wherever this gives null.
 */
export async function measureRound(options: { request: string | null; start: Image | null; drawings: Image[]; signal?: AbortSignal }): Promise<{ want: Want; measured: (Measured | null)[] } | null> {
  if (options.request === null || options.start === null || options.drawings.length === 0) return null;
  try {
    const want = await readWant(options.request, options.signal);
    if (want === null) return null;
    const boxes = await boxPart(options.request, options.start, options.drawings, options.signal);
    const measured = boxes.drawings.map((reading) => (boxes.start.usable && reading.usable ? compareBoxes(boxes.start.edges, reading.edges, want) : null));
    console.log(`Measured (${want.kind}): ${measured.map((entry) => (entry === null ? "fallback" : `${entry.moved ? `${entry.moved.direction} ${entry.moved.by.toFixed(2)}` : "unmoved"}${entry.resized ? `, ${entry.resized}` : ""}, ${entry.meets ? "meets" : "misses"}`)).join("; ")}`);
    return { want, measured };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    console.log(`Measurement fell back to the yes/no answers (${error instanceof Error ? error.message : "unknown error"})`);
    return null;
  }
}
