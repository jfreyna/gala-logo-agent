/**
 * Measuring drawings with Jev `box` (FRI-1725): for a request about where
 * one part sits or how big it is, the part is boxed in the starting mark
 * and in each drawing, code compares the edges, and FRI-1719's
 * `showsRequest` and `differsFromStart` come from that measurement.
 *
 *   node --experimental-strip-types --no-warnings engine/checks/measure.check.ts
 *
 * Jev is called, so this runs on the Sprite, with
 * `--env-file-if-exists=/home/sprite/gala.env`. Nothing is drawn by the
 * image model: every drawing is a mark drawn in code, so the truth is
 * known. The Half Step mark: three bars, the top one 60px further left,
 * the bottom one still aligned right under the middle one, as on the walk.
 * The real shift is 60px of 512 (0.12 of the image). A second, wider mark
 * (the top bar 120px further left) is where `box` reads the bottom bar
 * inconsistently, its left edge snapping to the whole mark's; case 10
 * runs it.
 *
 * What this proves:
 *   1. the comparison in code: an identical box reads unmoved, a shift
 *      under the tolerance reads unmoved, one past it reads moved the right
 *      way, and width or height past the tolerance reads grown or shrunk;
 *   2. Jev reads a move request as a move with its way, a size request as a
 *      resize with its way, and a style request as neither;
 *   3. `box` answers in the documented shape, close to a bar whose edges
 *      are known;
 *   4. boxing the same picture several times wanders less than the
 *      tolerance (the tolerance is wider than the noise it must ignore);
 *   5. the Half Step round replayed: three drawings identical to their
 *      start measure as unmoved, `showsRequest` comes back no and
 *      `differsFromStart` no;
 *   6. a real shift left (60px) measures as moved left, `showsRequest`
 *      yes and `differsFromStart` yes; the same shift to the right measures
 *      as moved right and `showsRequest` no;
 *   7. a size request measured both ways: a longer bar for "longer" shows
 *      the request, a shorter one doesn't;
 *   8. a request for a part the mark doesn't have is not measured, and
 *      keeps FRI-1719's answers;
 *   9. the fallback: with `box` refused (and, separately, every Jev call
 *      refused, as in the Nov 25 incident) the measurement gives nothing
 *      back without throwing, and `showsRequest` and `differsFromStart`
 *      are FRI-1719's yes/no answers;
 *  10. on the wider mark, where single boxes disagree, a real shift left is
 *      either measured as left or falls back; it is never measured as a
 *      move the other way or as unmoved.
 *
 * What it does not prove: each box is one model's reading of one picture,
 * and the tolerance is a judgment; a box reads a move at about half its
 * true distance, so a move under about 20px can read as unmoved. How
 * well `box` finds a part depends on the mark: case 10 shows it failing
 * to agree with itself on one. The marks here are clean bars on white,
 * easier to box than a real drawing. It does not prove the image model draws what was asked;
 * it proves Gala's two facts say whether it did.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { rasterize } from "../../kit/src/render.ts";
import { compareDrawing, judgeView } from "../marks.ts";
import { boxPart, compareBoxes, measureRound, MOVE_FLOOR, readWant, SIZE_FLOOR } from "../measure.ts";
import { compareDrawings } from "../stages/directions.ts";

const h = createHarness("Measured drawings (Jev box)");

const png = (bytes: Uint8Array) => ({ bytes, mime: "image/png" });
function mark(bottom: { x: number; width: number } | null, topX = 86): ReturnType<typeof png> {
  const bars = [
    `<rect x="${topX}" y="126" width="280" height="60" fill="#000000"/>`,
    `<rect x="146" y="226" width="280" height="60" fill="#000000"/>`,
    ...(bottom === null ? [] : [`<rect x="${bottom.x}" y="326" width="${bottom.width}" height="60" fill="#000000"/>`]),
  ].join("");
  return png(rasterize(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#FFFFFF"/>${bars}</svg>`, 512));
}
const HALF_STEP = mark({ x: 146, width: 280 }); // the bottom bar still aligned right, as on the walk
const SHIFTED_LEFT = mark({ x: 86, width: 280 }); // 60px to the left
const SHIFTED_RIGHT = mark({ x: 206, width: 280 });
const WIDE = mark({ x: 146, width: 280 }, 26);
const WIDE_SHIFTED_LEFT = mark({ x: 86, width: 280 }, 26);
const LONGER = mark({ x: 116, width: 340 });
const SHORTER = mark({ x: 176, width: 220 });

const MOVE = "Shift the bottom bar to the left by half a step.";
const LONGER_ASK = "Make the bottom bar longer.";

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

// 1. The comparison in code.

h.check("1. the comparison: identical and small shifts read unmoved; past the tolerance reads the right way; width past it reads grown or shrunk", () => {
  const bar = box(0.28, 0.64, 0.83, 0.75);
  const left = { kind: "move", direction: "left" } as const;
  assertEqual(compareBoxes(bar, bar, left).changed, false, "identical boxes changed");
  assertEqual(compareBoxes(bar, box(0.28 - MOVE_FLOOR / 2, 0.64, 0.83 - MOVE_FLOOR / 2, 0.75), left).moved, null, "a shift under the tolerance moved");
  const moved = compareBoxes(bar, box(0.22, 0.64, 0.77, 0.75), left);
  assertEqual(moved.moved?.direction, "left", "a 0.06 shift left");
  assert(moved.meets && moved.changed, "the left shift does not meet a left request");
  assertEqual(compareBoxes(bar, box(0.34, 0.64, 0.89, 0.75), left).meets, false, "a right shift meets a left request");
  const longer = { kind: "resize", way: "bigger" } as const;
  assertEqual(compareBoxes(bar, box(0.22, 0.64, 0.89, 0.75), longer).resized, "bigger", "a bar 0.12 wider");
  assertEqual(compareBoxes(bar, box(0.34, 0.64, 0.77, 0.75), longer).resized, "smaller", "a bar 0.12 narrower");
  assertEqual(compareBoxes(bar, box(0.34, 0.64, 0.77, 0.75), longer).meets, false, "a narrower bar meets a longer request");
});

// 2. The request read by Jev.

h.check("2. Jev reads a move with its way, a resize with its way, and a style request as neither", async () => {
  assertEqual(await readWant(MOVE), { kind: "move", direction: "left" }, "the move request");
  assertEqual(await readWant(LONGER_ASK), { kind: "resize", way: "bigger" }, "the size request");
  assertEqual(await readWant("Make it feel more playful and less corporate."), null, "the style request");
});

// 3 and 4. The box itself.

h.check("3. box answers in the documented shape, close to the known bottom bar", async () => {
  const { start } = await boxPart(MOVE, judgeView(HALF_STEP), []);
  assert(start.usable, `the bar's box is not usable: ${JSON.stringify(start)}`);
  const truth = box(146 / 512, 326 / 512, 426 / 512, 386 / 512);
  const off = Math.max(...(["left", "top", "right", "bottom"] as const).map((edge) => Math.abs(start.edges[edge] - truth[edge])));
  console.log(`    bottom bar boxed at ${JSON.stringify(start.edges)}; furthest edge ${off.toFixed(3)} from the truth`);
  // Boxes run loose around the ink (about 0.06 on the Nov 25 probe); this asserts the box is on the bar, not exact.
  assert(off < 0.1, `an edge is ${off.toFixed(3)} from the truth`);
});

h.check("4. the same picture read four times (each a median of samples) wanders less than the tolerance", async () => {
  const same = judgeView(HALF_STEP);
  const { start, drawings } = await boxPart(MOVE, same, [same, same, same]);
  assert(start.usable && drawings.every((reading) => reading.usable), "a box of the same picture is not usable");
  const centers = [start, ...drawings].map((reading) => ({ x: (reading.edges.left + reading.edges.right) / 2, y: (reading.edges.top + reading.edges.bottom) / 2, w: reading.edges.right - reading.edges.left, h: reading.edges.bottom - reading.edges.top }));
  const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
  const move = Math.max(spread(centers.map((c) => c.x)), spread(centers.map((c) => c.y)));
  const size = Math.max(spread(centers.map((c) => c.w)), spread(centers.map((c) => c.h)));
  console.log(`    wander: center ${move.toFixed(3)} (tolerance ${MOVE_FLOOR}), size ${size.toFixed(3)} (tolerance ${SIZE_FLOOR})`);
  assert(move < MOVE_FLOOR, `the center wandered ${move.toFixed(3)}`);
  assert(size < SIZE_FLOOR, `the size wandered ${size.toFixed(3)}`);
});

// 5 to 8. The round, measured.

h.check("5. Half Step replayed: three identical drawings measure as unmoved, showsRequest no, differsFromStart no", async () => {
  const compared = await compareDrawings([HALF_STEP, HALF_STEP, HALF_STEP], { wanted: [MOVE], start: HALF_STEP, newest: MOVE });
  compared.forEach((entry, index) => {
    assert(entry.measured !== null && entry.measured !== undefined, `drawing ${index + 1} was not measured`);
    assertEqual(entry.measured.moved, null, `drawing ${index + 1} moved`);
    assertEqual(entry.showsRequest, false, `drawing ${index + 1} showsRequest`);
    assertEqual(entry.differsFromStart, false, `drawing ${index + 1} differsFromStart`);
  });
});

h.check("6. a real 60px shift left measures as moved left (showsRequest yes); the same shift right does not show the request", async () => {
  const [left, right] = await compareDrawings([SHIFTED_LEFT, SHIFTED_RIGHT], { wanted: [MOVE], start: HALF_STEP, newest: MOVE });
  console.log(`    left: ${JSON.stringify(left!.measured)}; right: ${JSON.stringify(right!.measured)}`);
  assertEqual(left!.measured?.moved?.direction, "left", "the left shift's direction");
  assertEqual(left!.showsRequest, true, "the left shift's showsRequest");
  assertEqual(left!.differsFromStart, true, "the left shift's differsFromStart");
  assertEqual(right!.measured?.moved?.direction, "right", "the right shift's direction");
  assertEqual(right!.showsRequest, false, "the right shift's showsRequest");
  assertEqual(right!.differsFromStart, true, "the right shift's differsFromStart");
});

h.check("7. a size request measured both ways: a longer bar shows \"longer\", a shorter one doesn't", async () => {
  const [longer, shorter] = await compareDrawings([LONGER, SHORTER], { wanted: [LONGER_ASK], start: HALF_STEP, newest: LONGER_ASK });
  console.log(`    longer: ${JSON.stringify(longer!.measured)}; shorter: ${JSON.stringify(shorter!.measured)}`);
  assertEqual(longer!.measured?.resized, "bigger", "the longer bar");
  assertEqual(longer!.showsRequest, true, "the longer bar's showsRequest");
  assertEqual(shorter!.measured?.resized, "smaller", "the shorter bar");
  assertEqual(shorter!.showsRequest, false, "the shorter bar's showsRequest");
});

h.check("8. a part the mark doesn't have is not measured, and the round keeps FRI-1719's yes/no answers", async () => {
  const ask = "Move the small circle to the left.";
  const [entry] = await compareDrawings([SHIFTED_LEFT], { wanted: [ask], start: HALF_STEP, newest: ask });
  assertEqual(entry!.measured, null, "a part that isn't there was measured");
  // What FRI-1719's answers say here is one model's reading and not this check's claim; only that they are what the round kept.
  const yesNo = await compareDrawing(SHIFTED_LEFT, { request: [ask], start: HALF_STEP });
  assertEqual(entry!.showsRequest, yesNo.showsRequest, "showsRequest against FRI-1719's");
});

// 9. The fallback.

/** A stand-in for the TypeSafe connector that refuses some requests and passes the rest through. */
async function refusing(refuse: (body: string) => boolean, run: () => Promise<void>): Promise<void> {
  const real = process.env.GALA_TYPESAFE_URL;
  if (real === undefined || real === "") throw new Error("GALA_TYPESAFE_URL is not set");
  let refused = 0;
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString("utf8");
    if (refuse(body)) {
      refused++;
      response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "model not found" }));
      return;
    }
    const forwarded = await fetch(`${real.replace(/\/+$/, "")}${request.url}`, {
      method: "POST",
      headers: Object.fromEntries(Object.entries(request.headers).filter(([key]) => ["content-type", "typesafe-danger-zone-images"].includes(key)) as [string, string][]),
      body,
    });
    response.writeHead(forwarded.status, { "Content-Type": "application/json" }).end(Buffer.from(await forwarded.arrayBuffer()));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.GALA_TYPESAFE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run();
    assert(refused > 0, "nothing was refused, so the fallback was not exercised");
  } finally {
    process.env.GALA_TYPESAFE_URL = real;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

h.check("9a. with box refused, the round keeps FRI-1719's yes/no answers", async () => {
  await refusing(
    (body) => body.includes('"type":"box"'),
    async () => {
      const compared = await compareDrawings([HALF_STEP, SHIFTED_LEFT], { wanted: [MOVE], start: HALF_STEP, newest: MOVE });
      assert(compared.every((entry) => entry.measured === null), "a drawing was measured with box refused");
      const yesNo = await Promise.all([HALF_STEP, SHIFTED_LEFT].map((drawing) => compareDrawing(drawing, { request: [MOVE], start: HALF_STEP })));
      compared.forEach((entry, index) => {
        assert(typeof entry.showsRequest === "boolean" && typeof entry.differsFromStart === "boolean", `drawing ${index + 1} has no yes/no answers`);
      });
      // FRI-1719's answer on the identical drawing, asked directly, is what the round kept.
      assertEqual(compared[0]!.differsFromStart, yesNo[0]!.differsFromStart, "the identical drawing's differsFromStart");
    },
  );
});

h.check("9b. with every Jev call refused (the Nov 25 incident), the measurement gives nothing back and does not throw", async () => {
  await refusing(
    () => true,
    async () => {
      const result = await measureRound({ request: MOVE, start: judgeView(HALF_STEP), drawings: [judgeView(SHIFTED_LEFT)] });
      assertEqual(result, null, "the measurement with Jev refused");
    },
  );
});

h.check("10. on a mark where single boxes disagree, a real shift left is measured as left or falls back, never the wrong way", async () => {
  const [entry] = await compareDrawings([WIDE_SHIFTED_LEFT], { wanted: [MOVE], start: WIDE, newest: MOVE });
  console.log(`    wide mark: ${entry!.measured === null ? "fell back" : JSON.stringify(entry!.measured)}`);
  if (entry!.measured !== null && entry!.measured !== undefined) {
    assertEqual(entry!.measured.moved?.direction, "left", "the wide mark's measured direction");
    assertEqual(entry!.showsRequest, true, "the wide mark's showsRequest");
  }
});

await h.run();
