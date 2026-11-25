# Visual gate: every built screen beside its design frame

Each image here shows the Figma frame on the left and the built screen on the right, at the frame's own size and color mode. They are made by `scripts/visual-gate.mjs`.

**Command:** `node scripts/visual-gate.mjs <folder of frame PNGs> docs/visual-gate` (dev server running on port 3000; frames exported from the design file at 1x).

**Result:** `72/72 screens compared`

## What the number is

"Differing" is the share of pixels whose color differs from the frame by more than a small tolerance. It points at where to look; it is not a grade. Text renders a little differently in Figma and in a browser, so a screen that lines up exactly still shows about 0.5 to 3 percent.

## What the gate does not prove

- Behavior: hover, focus, typing, sending, scrolling, the rolling halls.
- Any width other than the two drawn (380 and 1440).
- Mobile dark for the studio screens, which the design file does not draw.
- Real content. The built side uses the frames' own sample content (`src/dev/fixtures.ts`), so it says nothing about how real brands, long names or other fonts fit.

## Known differences, and why

| Screen | Why it differs |
|---|---|
| `hallmodal-*` | The frame shows the modal over an earlier version of the home page. The modal itself lines up; the page behind it is the current one. |
| `brief-*`, `pickcolors-*` | The frames rest a short conversation against the prompt bar; most other frames rest it at the top. The build rests it at the top, and the preview for these two is set to the bottom to compare the rest. |
| `picks-mobile-light` | The frame clips the card's title at the right edge. The build wraps it to a second line so it can be read. |
| `signin-*`, `signingin-*`, `signinerror-*` | The join card's sign-in states are component variants in the design file, so they are compared as the card alone, 340 wide for desktop and 348 for a phone. |
| `kit-*`, `color-*`, `type-*` | The sample lock-ups and wordmarks are drawn with the frames' placeholder marks; sizes inside the paper differ slightly. |

## Results

```
intro-desktop-light            frame 1440x2165  built 1440x2165  differing 1.39%
intro-desktop-dark             frame 1440x2165  built 1440x2165  differing 2.24%
intro-mobile-light             frame 380x1621   built 380x1621   differing 1.65%
intro-mobile-dark              frame 380x1621   built 380x1621   differing 2.03%
about-desktop-light            frame 1440x1537  built 1440x1537  differing 1.67%
about-desktop-dark             frame 1440x1537  built 1440x1537  differing 1.73%
about-mobile-light             frame 380x1785   built 380x1785   differing 4.75%
about-mobile-dark              frame 380x1785   built 380x1785   differing 4.86%
hallmodal-desktop-light        frame 1440x900   built 1440x900   differing 16.99%
hallmodal-desktop-dark         frame 1440x900   built 1440x900   differing 22.41%
hallmodal-mobile-light         frame 380x812    built 380x812    differing 5.27%
accountmenu-desktop-light      frame 1440x900   built 1440x900   differing 0.77%
accountmenu-mobile-light       frame 380x812    built 380x812    differing 2.40%
hints-desktop-light            frame 1440x900   built 1440x900   differing 1.04%
hints-mobile-light             frame 380x812    built 380x812    differing 3.54%
projects-desktop-light         frame 1440x858   built 1440x858   differing 0.55%
projects-desktop-dark          frame 1440x858   built 1440x858   differing 0.58%
projects-mobile-light          frame 380x1702   built 380x1702   differing 0.90%
signin-desktop-light           frame 340x450    built 340x450    differing 2.83%
signin-desktop-dark            frame 340x450    built 340x450    differing 2.91%
signin-mobile-light            frame 348x450    built 348x450    differing 2.77%
signin-mobile-dark             frame 348x450    built 348x450    differing 2.83%
signingin-desktop-light        frame 340x450    built 340x450    differing 3.35%
signingin-desktop-dark         frame 340x450    built 340x450    differing 3.39%
signingin-mobile-light         frame 348x450    built 348x450    differing 3.28%
signingin-mobile-dark          frame 348x450    built 348x450    differing 3.30%
signinerror-desktop-light      frame 340x479    built 340x479    differing 3.12%
signinerror-desktop-dark       frame 340x479    built 340x479    differing 3.20%
signinerror-mobile-light       frame 348x479    built 348x479    differing 3.06%
signinerror-mobile-dark        frame 348x479    built 348x479    differing 3.11%
studio-desktop-light           frame 1440x900   built 1440x900   differing 0.50%
studio-desktop-dark            frame 1440x900   built 1440x900   differing 0.52%
studio-mobile-light            frame 380x812    built 380x812    differing 2.39%
brief-desktop-light            frame 1440x900   built 1440x900   differing 0.61%
brief-desktop-dark             frame 1440x900   built 1440x900   differing 0.65%
brief-mobile-light             frame 380x812    built 380x812    differing 1.49%
research-desktop-light         frame 1440x900   built 1440x900   differing 1.33%
research-desktop-dark          frame 1440x900   built 1440x900   differing 1.45%
research-mobile-light          frame 380x812    built 380x812    differing 5.34%
upload-desktop-light           frame 1440x900   built 1440x900   differing 1.30%
upload-desktop-dark            frame 1440x900   built 1440x900   differing 1.38%
upload-mobile-light            frame 380x812    built 380x812    differing 3.72%
type-desktop-light             frame 1440x900   built 1440x900   differing 2.90%
type-desktop-dark              frame 1440x900   built 1440x900   differing 1.75%
type-mobile-light              frame 380x812    built 380x812    differing 3.28%
directions-desktop-light       frame 1440x1000  built 1440x1000  differing 1.11%
directions-desktop-dark        frame 1440x1000  built 1440x1000  differing 1.18%
directions-mobile-light        frame 380x812    built 380x812    differing 2.47%
variations-desktop-light       frame 1440x900   built 1440x900   differing 1.05%
variations-desktop-dark        frame 1440x900   built 1440x900   differing 1.12%
variations-mobile-light        frame 380x812    built 380x812    differing 2.03%
stresstest-desktop-light       frame 1440x900   built 1440x900   differing 0.71%
stresstest-desktop-dark        frame 1440x900   built 1440x900   differing 0.75%
stresstest-mobile-light        frame 380x812    built 380x812    differing 1.70%
pickcolors-desktop-light       frame 1440x900   built 1440x900   differing 0.98%
pickcolors-desktop-dark        frame 1440x900   built 1440x900   differing 1.00%
pickcolors-mobile-light        frame 380x812    built 380x812    differing 13.47%
color-desktop-light            frame 1440x900   built 1440x900   differing 1.73%
color-desktop-dark             frame 1440x900   built 1440x900   differing 1.53%
color-mobile-light             frame 380x812    built 380x812    differing 3.29%
kit-desktop-light              frame 1440x900   built 1440x900   differing 3.03%
kit-desktop-dark               frame 1440x900   built 1440x900   differing 2.46%
kit-mobile-light               frame 380x812    built 380x812    differing 3.65%
picks-desktop-light            frame 1440x900   built 1440x900   differing 1.89%
picks-desktop-dark             frame 1440x900   built 1440x900   differing 2.09%
picks-mobile-light             frame 380x812    built 380x812    differing 5.35%
panel-desktop-light            frame 1440x900   built 1440x900   differing 1.91%
panel-desktop-dark             frame 1440x900   built 1440x900   differing 1.95%
panel-mobile-light             frame 380x812    built 380x812    differing 2.90%
memory-desktop-light           frame 1440x900   built 1440x900   differing 1.69%
memory-desktop-dark            frame 1440x900   built 1440x900   differing 1.82%
memory-mobile-light            frame 380x812    built 380x812    differing 2.25%
```
