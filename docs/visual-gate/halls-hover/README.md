# Halls: hover keeps the tile still

Each image shows the Figma frame on the left and the build on the right, made by `scripts/visual-gate.mjs` (the `hall` entries).

| Image | Frame | What it shows |
|---|---|---|
| `halltile-default-light`, `halltile-default-dark` | `gala-hall-tile`, State=Default, Kind=Fame | The tile at rest: the mark tinted. |
| `halltile-hover-light`, `halltile-hover-dark` | `gala-hall-tile`, State=Hover, Kind=Fame | The same tile hovered or focused: the same box, the mark in its real colors. |
| `hallrow-hover-desktop-light`, `hallrow-hover-mobile-light` | `gala-hall-carousel · Hover` spec section, desktop and phone | The row with one tile hovered. Nothing else in the row changes. |

**Result:** rows 1.16% (desktop) and 2.28% (phone) differing.

**The tile pairs print about 83%, and that number is the background.** This component set is exported on a blue-grey canvas (217, 224, 230), not the `#f5f5f5` the gate swaps for the page's color. Swapping that canvas for the page's color instead gives 0.98% (Default, light), 1.33% (Hover, light), 2.20% (Default, dark) and 2.47% (Hover, dark); what remains is the label's edge, antialiased against the canvas.

The Shame variants are the same tile in a different row, so the Fame pairs stand for both.

**What this does not prove:** that hover and focus leave the boxes alone (the smoke check in `scripts/smoke.mjs` measures that), touch input, or a phone in dark mode, which the spec section does not draw.
