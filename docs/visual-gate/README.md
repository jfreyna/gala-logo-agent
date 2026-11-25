# Visual gate: every built screen beside its design frame

Each image here shows the Figma frame on the left and the built screen on the right, at the frame's own size and color mode. They are made by `scripts/visual-gate.mjs`.

**Command:** `node scripts/visual-gate.mjs <folder of frame PNGs> docs/visual-gate` (dev server running on port 3000; frames exported from the design file at 1x).

**Result:** `72/72 screens compared`

## What the number is

"Differing" is the share of pixels whose color differs from the frame by more than a small tolerance. It points at where to look; it is not a grade. Text renders a little differently in Figma and in a browser, so a screen that lines up exactly still shows about 0.5 to 3 percent.

## What the gate does not prove

- Behavior: hover, focus, typing, sending, scrolling, the rolling halls, the backdrops' motion. The gate asks for reduced motion, so the backdrops are compared at rest; `scripts/check-backdrops.mjs` compares them with Figma's rendering more closely, and checks what moves.
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
| `intro-mobile-*` | The halls' backdrop is drawn from separate layers, and each layer is placed on whole device pixels. At the phone frame's size and one device pixel to one, the edges of the ribbon and the spheres land up to half a pixel from the frame. A phone screen has two or three device pixels to one, so the same rounding is finer there. The desktop frames place every layer on a whole pixel. |
| `kit-*`, `color-*`, `type-*` | The sample lock-ups and wordmarks are drawn with the frames' placeholder marks; sizes inside the paper differ slightly. |

## The working line on a phone

The prompt bar's Working variants draw the working line on one line, cut with an ellipsis when it does not fit. These three are the built bar alone, 348 wide on a 380 phone, at 2x. They are made by opening `/preview/studio?status=<line>`, which shows any working line in the bar.

| Image | What it shows |
|---|---|
| `working-line-mobile-light.png` | "Reading your brief…", light. It fits on one line. |
| `working-line-mobile-dark.png` | The same, dark. |
| `working-line-mobile-long.png` | "Looking at competitors and neighbors…", which does not fit, cut with an ellipsis. The bar stays 62 tall. |

## Results

```
intro-desktop-light            frame 1440x2165  built 1440x2165  differing 1.38%
intro-desktop-dark             frame 1440x2165  built 1440x2165  differing 1.58%
intro-mobile-light             frame 380x1621   built 380x1621   differing 1.72%
intro-mobile-dark              frame 380x1621   built 380x1621   differing 1.80%
about-desktop-light            frame 1440x1537  built 1440x1537  differing 1.67%
about-desktop-dark             frame 1440x1537  built 1440x1537  differing 1.73%
about-mobile-light             frame 380x1785   built 380x1785   differing 4.75%
about-mobile-dark              frame 380x1785   built 380x1785   differing 4.87%
hallmodal-desktop-light        frame 1440x900   built 1440x900   differing 17.05%
hallmodal-desktop-dark         frame 1440x900   built 1440x900   differing 21.66%
hallmodal-mobile-light         frame 380x812    built 380x812    differing 5.27%
accountmenu-desktop-light      frame 1440x900   built 1440x900   differing 0.77%
accountmenu-mobile-light       frame 380x812    built 380x812    differing 2.39%
hints-desktop-light            frame 1440x900   built 1440x900   differing 1.04%
hints-mobile-light             frame 380x812    built 380x812    differing 3.53%
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
studio-desktop-light           frame 1440x900   built 1440x900   differing 0.49%
studio-desktop-dark            frame 1440x900   built 1440x900   differing 0.52%
studio-mobile-light            frame 380x812    built 380x812    differing 1.64%
brief-desktop-light            frame 1440x900   built 1440x900   differing 0.61%
brief-desktop-dark             frame 1440x900   built 1440x900   differing 0.64%
brief-mobile-light             frame 380x812    built 380x812    differing 1.43%
research-desktop-light         frame 1440x900   built 1440x900   differing 1.16%
research-desktop-dark          frame 1440x900   built 1440x900   differing 1.32%
research-mobile-light          frame 380x812    built 380x812    differing 5.27%
upload-desktop-light           frame 1440x900   built 1440x900   differing 1.29%
upload-desktop-dark            frame 1440x900   built 1440x900   differing 1.37%
upload-mobile-light            frame 380x812    built 380x812    differing 3.69%
type-desktop-light             frame 1440x900   built 1440x900   differing 2.89%
type-desktop-dark              frame 1440x900   built 1440x900   differing 1.74%
type-mobile-light              frame 380x812    built 380x812    differing 3.25%
directions-desktop-light       frame 1440x1000  built 1440x1000  differing 1.09%
directions-desktop-dark        frame 1440x1000  built 1440x1000  differing 1.17%
directions-mobile-light        frame 380x812    built 380x812    differing 2.36%
variations-desktop-light       frame 1440x900   built 1440x900   differing 1.04%
variations-desktop-dark        frame 1440x900   built 1440x900   differing 1.11%
variations-mobile-light        frame 380x812    built 380x812    differing 2.01%
stresstest-desktop-light       frame 1440x900   built 1440x900   differing 0.70%
stresstest-desktop-dark        frame 1440x900   built 1440x900   differing 0.75%
stresstest-mobile-light        frame 380x812    built 380x812    differing 1.68%
pickcolors-desktop-light       frame 1440x900   built 1440x900   differing 0.98%
pickcolors-desktop-dark        frame 1440x900   built 1440x900   differing 1.00%
pickcolors-mobile-light        frame 380x812    built 380x812    differing 12.28%
color-desktop-light            frame 1440x900   built 1440x900   differing 1.72%
color-desktop-dark             frame 1440x900   built 1440x900   differing 1.52%
color-mobile-light             frame 380x812    built 380x812    differing 2.76%
kit-desktop-light              frame 1440x900   built 1440x900   differing 3.02%
kit-desktop-dark               frame 1440x900   built 1440x900   differing 2.45%
kit-mobile-light               frame 380x812    built 380x812    differing 3.52%
picks-desktop-light            frame 1440x900   built 1440x900   differing 1.80%
picks-desktop-dark             frame 1440x900   built 1440x900   differing 1.98%
picks-mobile-light             frame 380x812    built 380x812    differing 5.06%
panel-desktop-light            frame 1440x900   built 1440x900   differing 1.86%
panel-desktop-dark             frame 1440x900   built 1440x900   differing 1.90%
panel-mobile-light             frame 380x812    built 380x812    differing 2.90%
memory-desktop-light           frame 1440x900   built 1440x900   differing 1.64%
memory-desktop-dark            frame 1440x900   built 1440x900   differing 1.76%
memory-mobile-light            frame 380x812    built 380x812    differing 2.25%
```
