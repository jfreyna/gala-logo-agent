# About: the video and analytics lines

Each image shows the About page built from `main` at `d2fb240` on the left, and with the two new sentences in the "Built on" paragraph on the right, at 1440 (shown at half width) and 380, light and dark.

**Command:** `GALA_PREVIEW_URL=http://localhost:3001 node scripts/visual-gate.mjs <main's screenshots> <output>`, with `main`'s screenshots taken first from a dev server on `d2fb240`. Run on 2026-11-27.

**Result:** `103/103 screens compared`. Only the About screens changed:

| Screen | Height before | Height after | Differing |
| --- | --- | --- | --- |
| about-desktop-light | 1537 | 1612 | 1.58% |
| about-desktop-dark | 1537 | 1612 | 3.78% |
| about-mobile-light | 1785 | 1935 | 4.34% |
| about-mobile-dark | 1785 | 1935 | 7.96% |

Most of each About difference is the button and footer shifted down by the longer paragraph.

The other screens are unchanged apart from run-to-run noise. The hall modal shows the same 0.01 to 0.6% as `main` compared with itself. `intro-mobile-light` shows 0.02 to 0.54% across four runs of the same build, and it doesn't contain this copy.

**What it does not prove:** that the wording is right (the founder approved it), or how the paragraph wraps at widths between the two shown.
