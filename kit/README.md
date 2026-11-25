# kit: the lock-up kit pipeline

Phase 5 of Gala's process. The chosen black-and-white mark, a Google font and the brand colors go in. The lock-up kit and its spec sheet come out. The engine calls one function and stores what it returns.

```ts
import { buildKit } from "./kit/src/index.ts";

const { files, spec } = await buildKit({
  mark: { bytes, mime: "image/png" },        // PNG, JPEG or SVG; the format is read from the bytes
  name: "Ember & Rye",
  fontFamily: "Young Serif",                 // any Google Fonts family
  fontWeight: 400,                           // optional
  colors: { primary: "#B83A1B", secondary: "#E3B65C", tertiary: "#2B2622" },
  colorway: { mark: "primary", wordmark: "tertiary" },      // ground: "neutral" (default), "white" or a role
});
```

## What comes out

38 files, grouped by the kit card's format chips:

| Folder | Files |
|---|---|
| `svg/` | primary, stacked, icon and wordmark, each in color, all black and all white (12) |
| `eps/` | the same 12, as EPSF-3.0 |
| `png/` | the same 12, 2048 px on the long edge, transparent |
| `square/` | the icon on the colorway ground (a neutral light gray, `#F5F5F5`, unless the colorway names another), 1024×1024 |
| `social/` | the primary lock-up on the same ground, 1200×630 |

`spec` is the data for the panel's Kit view: clear space, minimum sizes, the typeface and its license, and each brand color with hex, RGB, CMYK, its 50 to 900 ladder, the step nearest the brand color, and its contrast on white and on black. `spec.pairs` holds the contrast of every color pairing the files use. All of it is computed in code.

## How it works

1. **Trace** (`src/trace.ts`). The mark is decoded, flattened onto white, thresholded at 50% and traced with Potrace. An SVG mark is rasterized first, so every mark leaves as plain paths. A white-on-black mark is flipped.
2. **Set the type** (`src/font.ts`). The family comes from the Google Fonts CSS API as TrueType and is converted to outlines with opentype.js, kerning on. No font file ships and no file depends on an installed font. The license and category come from the family's `METADATA.pb` in `google/fonts`.
3. **Lay out** (`src/layout.ts`). Proportions come from the `gala-kit` frame in Figma: primary is mark, gap 10/48, type 22/48; stacked is mark, gap 6/56, type 16/56. In the primary lock-up, type is centered on its cap height. In the stacked lock-up it hangs from its cap height, and moves down when the letters' real top (measured from the outlines) would come closer to the mark than the gap, as happens with typefaces that draw taller than the cap height they state. Files are cropped to their ink; clear space is a rule in the spec.
4. **Write** (`src/render.ts`). SVG, EPS and PNG all come from the same geometry (`src/path.ts`). The EPS is PostScript written directly; no converter runs at build time.
5. **Color** (`src/color.ts`). The ladder follows the method of Frilly's tenant dashboard colors page (FRI-1603): OKLCH, hue held, a fixed lightness ladder, a per-step chroma curve, and chroma-first gamut clamping. The brand hex is not forced into its own ladder; `nearestStep` names the closest step. Contrast is WCAG 2.x; labels are floored to one decimal so a label never shows a pass the ratio misses. CMYK is a straight formula, for reference only.

## Checks

```bash
cd kit && npm install
npm run typecheck
npm run verify:color   # ladders, contrast, CMYK and path maths against values computed outside this module
npm run verify:kit     # an end-to-end fixture run, then every file it returns
```

`verify:kit` needs network access to Google Fonts and Ghostscript (`gs`) for the EPS read-back. Without `gs`, the EPS checks report "not run" and the run prints "N/M, run incomplete". Each verifier states what it does not prove at the top of its file.

`npm run fixture` writes a full kit for `fixtures/spike_mark.png` to `out/fixture/`. `scripts/contact-sheet.mjs` lays files out the way the kit card does, for screenshots.

## Runtime

Node 22.6 or later. The TypeScript runs directly through Node's type stripping (the scripts pass `--experimental-strip-types`, which Node 24 needs no longer). Dependencies are npm only: `potrace`, `opentype.js`, `@resvg/resvg-js`, `pngjs` and `jpeg-js`. `phin`, which `potrace` pulls in through `jimp`, is pinned to 3.7.1 or later through `overrides`; the kit never passes jimp a URL.
