#!/usr/bin/env node
/**
 * Turns the backdrops' blurred ellipses into CSS radial gradients.
 *
 *   node scripts/fit-falloffs.mjs            prints the fit and its error for each ellipse
 *   node scripts/fit-falloffs.mjs --write    also writes src/backdrops/falloffs.ts
 *
 * In the design file a glow is an ellipse filled with a radial gradient and
 * then blurred. A blur is costly to animate, so the build draws each glow as
 * one CSS radial gradient whose falloff already has the blur in it. This
 * script does that arithmetic: it blurs the ellipse numerically (a true
 * Gaussian, standard deviation = half of Figma's layer-blur radius), then
 * finds the ellipse radii and the stops of the one radial gradient that is
 * closest to the blurred result, by least squares.
 *
 * What it proves: how far the fitted gradient is from the blurred ellipse, as
 * the largest difference in opacity anywhere in the glow. It prints that for
 * each one.
 * What it does not prove: how a browser draws the gradient. The at-rest check
 * (scripts/check-backdrops.mjs) compares real pixels.
 *
 * The spheres' shadows are not here. They are long, thin ellipses, and one
 * radial gradient is about 5% of their opacity away from the blurred shape,
 * so they stay blurred ellipses, drawn once and then only moved.
 *
 * The numbers below are read from the frames (file ETMfGxmje96l84LGRPEuFc,
 * "Intro" 5595:14205 and "About" 5595:14355): radii in frame pixels at the
 * desktop size, stops as [offset, opacity relative to the center].
 */
import { writeFile } from "node:fs/promises";

/** The falloff every glow in the frames uses: full at the center, 45% at six tenths of the way out, nothing at the edge. */
const GLOW = [[0, 1], [0.6, 0.45], [1, 0]];

const ELLIPSES = [
  { name: "heroLavender", rx: 460, ry: 497.455, sigma: 80, stops: GLOW },
  { name: "heroCenter", rx: 477, ry: 515.5, sigma: 80, stops: GLOW },
  { name: "heroLime", rx: 300, ry: 324.427, sigma: 80, stops: GLOW },
  { name: "aboutLeft", rx: 520, ry: 520, sigma: 80, stops: GLOW },
  { name: "aboutRight", rx: 640, ry: 640, sigma: 80, stops: GLOW },
];

const STOPS = 32;

/** Opacity of the unblurred ellipse at a point: the gradient inside it, nothing outside. */
function source(ellipse, x, y) {
  const t = Math.hypot(x / ellipse.rx, y / ellipse.ry);
  if (t >= 1) return 0;
  const stops = ellipse.stops;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, a0] = stops[i - 1];
      const [t1, a1] = stops[i];
      return a0 + ((a1 - a0) * (t - t0)) / (t1 - t0);
    }
  }
  return 0;
}

/** The blurred ellipse, sampled on a grid that reaches well past where it fades out. */
function blurred(ellipse) {
  const step = ellipse.sigma / 10;
  const reach = 4 * ellipse.sigma;
  const half = [Math.ceil((ellipse.rx + reach) / step), Math.ceil((ellipse.ry + reach) / step)];
  const [width, height] = [2 * half[0] + 1, 2 * half[1] + 1];
  let field = new Float64Array(width * height);
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) field[j * width + i] = source(ellipse, (i - half[0]) * step, (j - half[1]) * step);

  const radius = Math.ceil(reach / step);
  const kernel = Array.from({ length: 2 * radius + 1 }, (_, k) => Math.exp(-(((k - radius) * step) ** 2) / (2 * ellipse.sigma ** 2)));
  const total = kernel.reduce((sum, weight) => sum + weight, 0);
  for (const horizontal of [true, false]) {
    const next = new Float64Array(width * height);
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const [ii, jj] = horizontal ? [i + k, j] : [i, j + k];
          if (ii >= 0 && ii < width && jj >= 0 && jj < height) sum += field[jj * width + ii] * kernel[k + radius];
        }
        next[j * width + i] = sum / total;
      }
    }
    field = next;
  }
  return { field, width, height, half, step };
}

/**
 * The stops of the radial gradient with radii (Rx, Ry) closest to the field,
 * by least squares, with the last stop held at zero so the gradient has no
 * edge. Returns the stops and the largest difference anywhere on the grid.
 */
function fit(grid, Rx, Ry) {
  const { field, width, height, half, step } = grid;
  const n = STOPS; // unknowns: stops 0..n-1; stop n is zero
  const diagonal = new Float64Array(n);
  const upper = new Float64Array(n);
  const right = new Float64Array(n);
  const position = (i, j) => Math.hypot(((i - half[0]) * step) / Rx, ((j - half[1]) * step) / Ry) * n;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const p = position(i, j);
      if (p >= n) continue;
      const k = Math.floor(p);
      const w1 = p - k;
      const w0 = 1 - w1;
      const value = field[j * width + i];
      diagonal[k] += w0 * w0;
      right[k] += w0 * value;
      if (k + 1 < n) {
        diagonal[k + 1] += w1 * w1;
        upper[k] += w0 * w1;
        right[k + 1] += w1 * value;
      }
    }
  }
  // Solve the symmetric tridiagonal system.
  const c = new Float64Array(n);
  const d = new Float64Array(n);
  c[0] = upper[0] / diagonal[0];
  d[0] = right[0] / diagonal[0];
  for (let k = 1; k < n; k++) {
    const m = diagonal[k] - upper[k - 1] * c[k - 1];
    c[k] = upper[k] / m;
    d[k] = (right[k] - upper[k - 1] * d[k - 1]) / m;
  }
  const stops = new Float64Array(n + 1);
  stops[n - 1] = d[n - 1];
  for (let k = n - 2; k >= 0; k--) stops[k] = d[k] - c[k] * stops[k + 1];

  let worst = 0;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const p = position(i, j);
      const k = Math.floor(p);
      const drawn = p >= n ? 0 : stops[k] + (stops[k + 1] - stops[k]) * (p - k);
      worst = Math.max(worst, Math.abs(drawn - field[j * width + i]));
    }
  }
  return { stops: Array.from(stops, (value) => Math.max(0, Math.round(value * 10000) / 10000)), worst };
}

const results = [];
for (const ellipse of ELLIPSES) {
  const grid = blurred(ellipse);
  // Try gradients that reach 1.5 to 3.5 standard deviations past the ellipse, on each axis.
  let best = null;
  for (let ex = 1.5; ex <= 3.51; ex += 0.25) {
    for (let ey = 1.5; ey <= 3.51; ey += 0.25) {
      const [Rx, Ry] = [ellipse.rx + ex * ellipse.sigma, ellipse.ry + ey * ellipse.sigma];
      const candidate = fit(grid, Rx, Ry);
      if (best === null || candidate.worst < best.worst) best = { ...candidate, Rx, Ry };
    }
  }
  results.push({ name: ellipse.name, ...best });
  console.log(`${ellipse.name.padEnd(13)} radii ${best.Rx.toFixed(1)} x ${best.Ry.toFixed(1)}  largest difference ${(best.worst * 100).toFixed(2)}% of the center's opacity`);
}

if (process.argv.includes("--write")) {
  const body = results.map((result) => `  ${result.name}: { rx: ${Math.round(result.Rx * 1000) / 1000}, ry: ${Math.round(result.Ry * 1000) / 1000}, stops: [${result.stops.join(", ")}] },`).join("\n");
  await writeFile(
    new URL("../src/backdrops/falloffs.ts", import.meta.url),
    `/**
 * Written by scripts/fit-falloffs.mjs. Do not edit by hand: change the
 * numbers in the script and run it with --write.
 *
 * Each entry is one blurred ellipse from the frames as a radial gradient:
 * the gradient's radii in frame pixels at the desktop size, and its stops,
 * evenly spaced from the center out, as opacity relative to the center.
 */
export type Falloff = { rx: number; ry: number; stops: readonly number[] };

export const FALLOFFS = {
${body}
} as const satisfies Record<string, Falloff>;
`,
  );
  console.log("Wrote src/backdrops/falloffs.ts");
}
