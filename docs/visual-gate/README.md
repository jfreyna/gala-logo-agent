# Visual gate: every built screen beside its design frame

Each image here shows the Figma frame on the left and the built screen on the right, at the frame's own size and color mode. They are made by `scripts/visual-gate.mjs`.

**Command:** `node scripts/visual-gate.mjs <folder of frame PNGs> docs/visual-gate` (dev server running on port 3000; frames exported from the design file at 1x). Last run for FRI-1709, on port 3003 and rebased on `main` at `d358b6f`, with all 72 frames exported again on 2026-11-24 after the seat's changes (fades removed, the type row, the text colors).

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
| `directions-desktop-*` | Scrolled to the newest item, the build shows the 64px of space under the conversation's last item (FRI-1709 finding 1), so everything sits 28px higher than in the frame. The frame lays its conversation out from the top and clips what overflows, so its bottom padding never shows. The cards and the set-aside strip match. |
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
intro-desktop-light            frame 1440x2165  built 1440x2165  differing 1.47%
intro-desktop-dark             frame 1440x2165  built 1440x2165  differing 1.63%
intro-mobile-light             frame 380x1621   built 380x1621   differing 1.77%
intro-mobile-dark              frame 380x1621   built 380x1621   differing 1.84%
about-desktop-light            frame 1440x1537  built 1440x1537  differing 1.67%
about-desktop-dark             frame 1440x1537  built 1440x1537  differing 1.73%
about-mobile-light             frame 380x1785   built 380x1785   differing 4.75%
about-mobile-dark              frame 380x1785   built 380x1785   differing 4.87%
hallmodal-desktop-light        frame 1440x900   built 1440x900   differing 17.10%
hallmodal-desktop-dark         frame 1440x900   built 1440x900   differing 21.71%
hallmodal-mobile-light         frame 380x812    built 380x812    differing 5.25%
accountmenu-desktop-light      frame 1440x900   built 1440x900   differing 0.77%
accountmenu-mobile-light       frame 380x812    built 380x812    differing 2.42%
hints-desktop-light            frame 1440x900   built 1440x900   differing 1.04%
hints-mobile-light             frame 380x812    built 380x812    differing 3.56%
projects-desktop-light         frame 1440x858   built 1440x858   differing 0.52%
projects-desktop-dark          frame 1440x858   built 1440x858   differing 0.58%
projects-mobile-light          frame 380x1702   built 380x1702   differing 0.85%
signin-desktop-light           frame 340x450    built 340x450    differing 2.79%
signin-desktop-dark            frame 340x450    built 340x450    differing 2.88%
signin-mobile-light            frame 348x450    built 348x450    differing 2.74%
signin-mobile-dark             frame 348x450    built 348x450    differing 2.80%
signingin-desktop-light        frame 340x450    built 340x450    differing 3.31%
signingin-desktop-dark         frame 340x450    built 340x450    differing 3.35%
signingin-mobile-light         frame 348x450    built 348x450    differing 3.24%
signingin-mobile-dark          frame 348x450    built 348x450    differing 3.27%
signinerror-desktop-light      frame 340x479    built 340x479    differing 3.09%
signinerror-desktop-dark       frame 340x479    built 340x479    differing 3.17%
signinerror-mobile-light       frame 348x479    built 348x479    differing 3.02%
signinerror-mobile-dark        frame 348x479    built 348x479    differing 3.08%
studio-desktop-light           frame 1440x900   built 1440x900   differing 0.50%
studio-desktop-dark            frame 1440x900   built 1440x900   differing 0.53%
studio-mobile-light            frame 380x812    built 380x812    differing 1.66%
brief-desktop-light            frame 1440x900   built 1440x900   differing 0.61%
brief-desktop-dark             frame 1440x900   built 1440x900   differing 0.65%
brief-mobile-light             frame 380x812    built 380x812    differing 1.32%
research-desktop-light         frame 1440x900   built 1440x900   differing 1.15%
research-desktop-dark          frame 1440x900   built 1440x900   differing 1.22%
research-mobile-light          frame 380x812    built 380x812    differing 5.04%
upload-desktop-light           frame 1440x900   built 1440x900   differing 1.30%
upload-desktop-dark            frame 1440x900   built 1440x900   differing 1.38%
upload-mobile-light            frame 380x812    built 380x812    differing 3.72%
type-desktop-light             frame 1440x900   built 1440x900   differing 3.17%
type-desktop-dark              frame 1440x900   built 1440x900   differing 1.84%
type-mobile-light              frame 380x812    built 380x812    differing 3.50%
directions-desktop-light       frame 1440x1000  built 1440x1000  differing 4.33%
directions-desktop-dark        frame 1440x1000  built 1440x1000  differing 7.56%
directions-mobile-light        frame 380x812    built 380x812    differing 2.78%
variations-desktop-light       frame 1440x900   built 1440x900   differing 1.20%
variations-desktop-dark        frame 1440x900   built 1440x900   differing 1.22%
variations-mobile-light        frame 380x812    built 380x812    differing 2.34%
stresstest-desktop-light       frame 1440x900   built 1440x900   differing 0.71%
stresstest-desktop-dark        frame 1440x900   built 1440x900   differing 0.75%
stresstest-mobile-light        frame 380x812    built 380x812    differing 1.73%
pickcolors-desktop-light       frame 1440x900   built 1440x900   differing 0.99%
pickcolors-desktop-dark        frame 1440x900   built 1440x900   differing 1.00%
pickcolors-mobile-light        frame 380x812    built 380x812    differing 10.64%
color-desktop-light            frame 1440x900   built 1440x900   differing 1.87%
color-desktop-dark             frame 1440x900   built 1440x900   differing 1.58%
color-mobile-light             frame 380x812    built 380x812    differing 3.12%
kit-desktop-light              frame 1440x900   built 1440x900   differing 3.02%
kit-desktop-dark               frame 1440x900   built 1440x900   differing 2.46%
kit-mobile-light               frame 380x812    built 380x812    differing 3.59%
picks-desktop-light            frame 1440x900   built 1440x900   differing 1.70%
picks-desktop-dark             frame 1440x900   built 1440x900   differing 1.77%
picks-mobile-light             frame 380x812    built 380x812    differing 4.91%
panel-desktop-light            frame 1440x900   built 1440x900   differing 2.25%
panel-desktop-dark             frame 1440x900   built 1440x900   differing 2.09%
panel-mobile-light             frame 380x812    built 380x812    differing 3.79%
memory-desktop-light           frame 1440x900   built 1440x900   differing 1.86%
memory-desktop-dark            frame 1440x900   built 1440x900   differing 1.92%
memory-mobile-light            frame 380x812    built 380x812    differing 2.39%
```

## FRI-1709 screenshots

In `fri1709/`, from the dev previews at 2x, light and dark. They use the previews' sample content, except where noted.

| Images | What they show |
|---|---|
| `f1-end-*` | Finding 1. Scrolled to the newest item of a long conversation: a hard edge, no fades, and the last item 92px (52px on a phone) above the prompt bar. |
| `f1-mid-*` | Finding 1. The same conversation halfway: it clips with a hard edge at the top and the bottom. |
| `f2-research-*` | Finding 2. The research cards with each brand's own site icon, from a run of the founder's Gala brief on the Sprite (names, notes and icons as that run stored them). |
| `f3-cards-*` | Finding 3. The directions named as on the founder's walk (Tilted Brush, Ink Pivot, Press Chase) with five or six lines of rationale each: the cards grow, the rationale never meets the checks, and the checks and Choose line up across the row. |
| `f8-history-*` | Finding 8. The History view, with "Back to this step" under each Done row. |
| `f9-tray-*` | Finding 9. The type tray scrolled partway: each specimen above its name, with a line under each row. |
