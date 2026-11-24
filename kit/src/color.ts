/**
 * Color math for the kit: hex parsing, the 50 to 900 ladder, WCAG contrast
 * and a straight CMYK conversion. Pure and dependency-free.
 *
 * The ladder follows the method of Frilly's tenant dashboard colors page
 * (FRI-1603), re-implemented here: each brand color is its own anchor; it is
 * taken into OKLCH (Bjorn Ottosson's OKLab), its hue is held, lightness walks
 * a fixed ladder, chroma is the anchor's chroma scaled by a per-step curve,
 * and an out-of-gamut step loses chroma (never lightness or hue) until it
 * fits sRGB. The brand hex itself is not placed in the ladder; `nearestStep`
 * names the step closest to it.
 *
 * What this module does not prove (gate 3b): CMYK here is a formula, not a
 * press profile, so it is labeled for reference only. Contrast is WCAG 2.x
 * relative luminance, which says nothing about perceived legibility at a
 * given size or weight beyond the 4.5:1 and 3:1 thresholds.
 */

export type Role = "primary" | "secondary" | "tertiary";

export const LADDER_STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"] as const;
export type LadderStep = (typeof LADDER_STEPS)[number];

/** Target OKLCH lightness per step (the FRI-1603 ladder). */
const STEP_LIGHTNESS: readonly number[] = [0.979, 0.956, 0.904, 0.83, 0.745, 0.652, 0.52, 0.43, 0.283, 0.214];
/** Per-step chroma as a share of the anchor's chroma (the FRI-1603 curve). */
const STEP_CHROMA: readonly number[] = [0.09, 0.21, 0.28, 0.58, 0.72, 0.82, 1.0, 1.05, 0.83, 0.62];

export type Rgb = [number, number, number];
type Lab = [number, number, number];

const HEX = /^#([0-9a-f]{6})$/i;

export function isHex(value: string): boolean {
  return HEX.test(value);
}

/** Normalizes to upper-case `#RRGGBB`, or throws. */
export function normalizeHex(value: string): string {
  if (!isHex(value)) throw new Error(`kit: "${value}" is not a #rrggbb color`);
  return value.toUpperCase();
}

export function hexToRgb(hex: string): Rgb {
  const h = normalizeHex(hex);
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function toLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** sRGB (0-255) to OKLab. */
function rgbToLab([r, g, b]: Rgb): Lab {
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab to linear-light sRGB in 0-1 (may fall outside the gamut). */
function labToLinear([L, a, b]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const GAMUT_SLACK = 1e-5;

function fitsGamut(L: number, C: number, hueRad: number): boolean {
  const lin = labToLinear([L, C * Math.cos(hueRad), C * Math.sin(hueRad)]);
  return lin.every((v) => {
    const encoded = fromLinear(v);
    return encoded >= -GAMUT_SLACK && encoded <= 1 + GAMUT_SLACK;
  });
}

function lchToHex(L: number, C: number, hueRad: number): string {
  let chroma = C;
  if (!fitsGamut(L, chroma, hueRad)) {
    // Bisect chroma downward until the color is inside sRGB.
    let lo = 0;
    let hi = chroma;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (fitsGamut(L, mid, hueRad)) lo = mid;
      else hi = mid;
    }
    chroma = lo;
  }
  const lin = labToLinear([L, chroma * Math.cos(hueRad), chroma * Math.sin(hueRad)]);
  const hex = lin
    .map((v) => Math.round(Math.min(1, Math.max(0, fromLinear(v))) * 255))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`.toUpperCase();
}

export type LadderEntry = { step: LadderStep; hex: string };

/** The 10-step ladder for one brand color. Deterministic. */
export function ladder(brandHex: string): LadderEntry[] {
  const [, a, b] = rgbToLab(hexToRgb(brandHex));
  const chroma = Math.hypot(a, b);
  const hue = Math.atan2(b, a);
  return LADDER_STEPS.map((step, i) => ({
    step,
    hex: lchToHex(STEP_LIGHTNESS[i]!, chroma * STEP_CHROMA[i]!, hue),
  }));
}

/** OKLab distance x100 (about 2 is a just-noticeable difference). */
export function deltaE(hexA: string, hexB: string): number {
  const p = rgbToLab(hexToRgb(hexA));
  const q = rgbToLab(hexToRgb(hexB));
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** The ladder step closest to the brand color, the one the spec outlines. */
export function nearestStep(brandHex: string, steps: LadderEntry[]): LadderStep {
  let best = steps[0]!;
  for (const entry of steps) {
    if (deltaE(brandHex, entry.hex) < deltaE(brandHex, best.hex)) best = entry;
  }
  return best.step;
}

/** WCAG 2.x relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export type Contrast = {
  /** The unrounded ratio; pass and fail are decided on this. */
  ratio: number;
  /** Floored to one decimal, so the label never shows a pass the ratio misses (4.47 reads "4.4:1"). */
  label: string;
  /** At least 4.5:1, WCAG AA for body text. */
  aaText: boolean;
  /** At least 3:1, WCAG AA for large text and graphics. */
  aaLarge: boolean;
};

export function contrast(foreground: string, background: string): Contrast {
  const a = luminance(foreground);
  const b = luminance(background);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const floored = Math.floor(ratio * 10 + 1e-9) / 10;
  return { ratio, label: `${floored.toFixed(1)}:1`, aaText: ratio >= 4.5, aaLarge: ratio >= 3 };
}

/**
 * Straight RGB to CMYK, whole percentages. No ink profile: reference only,
 * "Confirm them with your printer before a print run".
 */
export function cmyk(hex: string): [number, number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as Rgb;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1 - 1e-9) return [0, 0, 0, 100];
  const pct = (v: number) => Math.round(v * 100);
  return [pct((1 - r - k) / (1 - k)), pct((1 - g - k) / (1 - k)), pct((1 - b - k) / (1 - k)), pct(k)];
}
