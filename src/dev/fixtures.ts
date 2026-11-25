/**
 * Development only. The sample content the Figma frames show (the made-up
 * bakery "Ember & Rye"), so every screen can be put beside its frame before
 * the engine exists. Nothing here ships: the preview route that reads it is
 * compiled out of production builds.
 */
import hearthRaw from "./marks/hearth.svg?raw";
import monogramRaw from "./marks/monogram.svg?raw";
import peelRaw from "./marks/peel.svg?raw";
import risingRaw from "./marks/rising.svg?raw";
import wheatRaw from "./marks/discard-wheat.svg?raw";
import badgeRaw from "./marks/discard-badge.svg?raw";
import narrowRaw from "./marks/hearth-narrow.svg?raw";
import heavyRaw from "./marks/hearth-heavy.svg?raw";
import withNameRaw from "./marks/hearth-with-name.svg?raw";
import type { HallEntry } from "../components/HallTile";
import type { StreamItem } from "../studio/streamTypes";
import type { PanelView } from "../studio/panel/types";
import type { Check } from "../studio/artifacts/types";

const dataUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
/** A placeholder mark with its black swapped for a color (the flame stays as drawn). */
const tinted = (svg: string, color: string, flame = "white") =>
  dataUrl(svg.replace(/fill="black"/g, `fill="${color}"`).replace(/stroke="black"/g, `stroke="${color}"`).replace(/fill="white"/g, `fill="${flame}"`));

export const marks = {
  hearth: dataUrl(hearthRaw),
  monogram: dataUrl(monogramRaw),
  peel: dataUrl(peelRaw),
  rising: dataUrl(risingRaw),
  wheat: dataUrl(wheatRaw),
  badge: dataUrl(badgeRaw),
  narrow: dataUrl(narrowRaw),
  heavy: dataUrl(heavyRaw),
  withName: dataUrl(withNameRaw),
};

const BRAND = "Ember & Rye";
const PRIMARY = "#B83A1B";
const SECONDARY = "#E3B65C";
const TERTIARY = "#2B2622";
const pass = (...labels: string[]): Check[] => labels.map((label) => ({ label, pass: true }));

const opening: StreamItem = {
  id: "opening",
  kind: "gala",
  text: "Tell me who you’re building this for, and give me three words you never want associated with your brand. I’ll start there.",
};
const visitorBrief: StreamItem = { id: "visitor-brief", kind: "visitor", text: "Ember & Rye, a wood-fired bakery in Madison. Never: fussy, corporate, cute." };

const conceptSet: StreamItem = {
  id: "concepts",
  kind: "conceptSet",
  data: {
    say: "Three directions, in black and white. A holds up best at small sizes. B is the most ownable, but it breaks at 16px.",
    concepts: [
      { id: "a", letter: "A", name: "Hearth", rationale: "Holds its shape at 16px, and reads as a bakery before you read the name.", markUrl: marks.hearth, checks: pass("16px", "Circle", "Inverted") },
      {
        id: "b",
        letter: "B",
        name: "Peel",
        rationale: "The most ownable of the three, but the handle thins out at 16px.",
        markUrl: marks.peel,
        checks: [{ label: "16px", pass: false }, ...pass("Circle", "Inverted")],
      },
      { id: "c", letter: "C", name: "Rising", rationale: "Warm and simple. The least distinct from other bakeries nearby.", markUrl: marks.rising, checks: pass("16px", "Circle", "Inverted") },
    ],
    discarded: [
      { id: "wheat", markUrl: marks.wheat, reason: "Unreadable at 16px" },
      { id: "badge", markUrl: marks.badge, reason: "Too close to a competitor’s mark" },
    ],
    chosenId: null,
  },
};

const stressTest: StreamItem = {
  id: "stress",
  kind: "stressTest",
  data: {
    say: "Hearth, against the real world. It passes all four: it still reads at 16px, survives the circle crop, and the flame stays open when inverted.",
    brandName: BRAND,
    markUrl: marks.hearth,
    checks: { sixteen: true, circle: true, inverted: true, poster: true },
  },
};

const colorPickerSay = "Now it’s time to pick your colors. Primary leads, secondary supports, and tertiary is optional.";

const lockup = (mark: string, color: string, size: number, text: number | null, stacked = false) =>
  dataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${stacked ? 150 : 220}" height="${stacked ? 90 : 60}" viewBox="0 0 ${stacked ? 150 : 220} ${stacked ? 90 : 60}">` +
      (mark ? `<image href="${mark}" x="${stacked ? 47 : text === null ? 80 : 0}" y="${stacked ? 0 : (60 - size) / 2}" width="${size}" height="${size}"/>` : "") +
      (text !== null
        ? `<text x="${stacked ? 75 : mark ? size + 10 : 110}" y="${stacked ? 82 : 38}" text-anchor="${stacked || !mark ? "middle" : "start"}" font-family="Young Serif, serif" font-size="${text}" fill="${color}">Ember &amp; Rye</text>`
        : "") +
      `</svg>`,
  );

const kit: StreamItem = {
  id: "kit",
  kind: "kit",
  data: {
    say: "Your lock-up kit is ready. You have primary, stacked, and monochrome variants in SVG and EPS, plus a quick-reference sheet for your hex and CMYK values.",
    lockups: [
      { label: "Primary", previewUrl: lockup(tinted(heavyRaw, PRIMARY), TERTIARY, 48, 22), ground: "white" },
      { label: "Stacked", previewUrl: lockup(tinted(heavyRaw, PRIMARY), TERTIARY, 56, 16, true), ground: "white" },
      { label: "Icon", previewUrl: tinted(heavyRaw, PRIMARY), ground: "white" },
      { label: "Wordmark", previewUrl: lockup("", TERTIARY, 0, 26), ground: "white" },
      { label: "All black", previewUrl: lockup(dataUrl(heavyRaw), "#000000", 48, 22), ground: "white" },
      { label: "All white", previewUrl: lockup(tinted(heavyRaw, "white", "black"), "#FFFFFF", 48, 22), ground: "black" },
    ],
    formats: ["SVG", "EPS", "PNG", "Square", "Social"],
  },
};

const wordmark: StreamItem = {
  id: "wordmark",
  kind: "wordmark",
  data: {
    say: "Here’s Ember & Rye in Young Serif, before any symbol. I kept your capitals and left the spacing as the typeface draws it. Approve it, or ask me to change the case, the spacing or the typeface.",
    brandName: BRAND,
    family: "Young Serif",
    case: "asTyped",
    spacing: "asDrawn",
    letterSpacingEm: 0,
    approved: false,
  },
};

const lockupCard = (layout: "sideBySide" | "stacked"): StreamItem => ({
  id: "lockup",
  kind: "lockup",
  data: {
    say: "Hearth and your wordmark together. Side by side suits signs and the site header; stacked suits bags and the square avatar. Pick the one you’ll use most. The kit includes both.",
    brandName: BRAND,
    family: "Young Serif",
    letterSpacingEm: 0,
    markName: "Hearth",
    markUrl: marks.heavy,
    layout,
    spaceBetween: "asSet",
    gapScale: 1,
    approved: false,
  },
});

/** Each studio screen in the frames: its conversation and its prompt placeholders. */
export const screens: Record<string, { items: StreamItem[]; placeholder: string; placeholderMobile: string; working?: [string, string] }> = {
  studio: {
    items: [opening, visitorBrief, { id: "working", kind: "working", text: "Looking at competitors and neighbors" }],
    placeholder: "Tell me about the brand you're building.",
    placeholderMobile: "Tell me about your brand.",
    working: ["I’m drawing three directions…", "Drawing three directions…"],
  },
  brief: {
    items: [
      opening,
      visitorBrief,
      {
        id: "brief",
        kind: "brief",
        data: {
          say: "Here’s your brief so far. Who are you building this for, mostly?",
          brand: BRAND,
          tagline: null,
          whatYouDo: "A wood-fired bakery in Madison",
          audience: null,
          whereUsed: null,
          never: ["fussy", "corporate", "cute"],
          pending: ["audience", "whereUsed"],
        },
      },
    ],
    placeholder: "Tell me who it’s for, mostly.",
    placeholderMobile: "Tell me who it’s for.",
  },
  briefComplete: {
    items: [
      visitorBrief,
      {
        id: "brief",
        kind: "brief",
        data: {
          say: "That’s the brief. Edit anything I got wrong; I’ll start the research.",
          brand: BRAND,
          tagline: null,
          whatYouDo: "A wood-fired bakery in Madison",
          audience: "Neighbors, early risers and the Saturday market crowd",
          whereUsed: ["Storefront sign", "Bags", "Menus", "Instagram"],
          never: ["fussy", "corporate", "cute"],
          pending: [],
        },
      },
    ],
    placeholder: "Tell me who it’s for, mostly.",
    placeholderMobile: "Tell me who it’s for.",
  },
  research: {
    items: [
      {
        id: "research",
        kind: "research",
        data: {
          say: "I looked at six competitors and four neighbors. Here’s what to steer clear of, and what’s worth borrowing.",
          competitors: [
            { name: "Hearthside Breads", note: "A wheat sheaf in a circle. Wheat is taken.", imageUrl: null },
            { name: "Golden Crust Bakery", note: "Script lettering in gold. Too fussy for your brief.", imageUrl: null },
            { name: "The Daily Loaf", note: "A smiling loaf. Cute, which you ruled out.", imageUrl: null },
          ],
          neighbors: [
            { name: "Ironwood Pizza", note: "One bold arch for the oven. Simple and warm.", imageUrl: null },
            { name: "Fieldstone Market", note: "Stamped, slightly rough type. It feels made by hand.", imageUrl: null },
            { name: "Copper Kettle Coffee", note: "One accent color on charcoal. Calm, with a spark.", imageUrl: null },
          ],
        },
      },
      {
        id: "direction",
        kind: "direction",
        data: {
          say: "Here’s the direction I’d take. Tell me if it’s off before I draw anything.",
          mood: "Warm, plain-spoken, a little worn",
          posture: "Steady and grounded, never trendy",
          energy: "Slow heat: calm, with one bright accent",
          references: ["Hand-painted signs", "Oven arches", "Flour sacks", "Market stalls"],
        },
      },
    ],
    placeholder: "Or tell me what to change in the direction.",
    placeholderMobile: "Or tell me what to change in the direction.",
  },
  upload: {
    items: [
      opening,
      { id: "upload", kind: "upload", fileName: "napkin-sketch.jpg", sizeLabel: "1.2 MB", imageUrl: marks.hearth, text: "Here’s a napkin sketch of the idea. The flame matters most." },
      { id: "ack", kind: "gala", text: "I see a flame over a loaf, drawn loose. I’ll keep the flame and draw it cleaner." },
    ],
    placeholder: "Tell me about the brand you're building.",
    placeholderMobile: "Tell me about your brand.",
  },
  type: {
    items: [
      visitorBrief,
      {
        id: "type",
        kind: "typeSet",
        data: {
          say: "Three type directions, chosen from Google’s own categories. A has the warmth your brief asks for; C is the calmest, but it leans corporate.",
          brandName: BRAND,
          saved: false,
          chosenId: null,
          directions: [
            { id: "a", letter: "A", family: "Young Serif", category: "Serif · Old Style Garalde", moods: "Vintage, sincere, rugged", rationale: "Warm and a little worn, like a hand-painted sign. Never fussy.", pick: "gala" },
            { id: "b", letter: "B", family: "Alegreya Sans", category: "Sans · Humanist", moods: "Competent, sincere, rugged", rationale: "Friendly and steady. Reads well small, on menus and bags.", pick: null },
            { id: "c", letter: "C", family: "Outfit", category: "Sans · Geometric", moods: "Calm, competent, business", rationale: "The calmest of the three, but it leans corporate, which your brief rules out.", pick: null },
          ],
        },
      },
    ],
    placeholder: "Pick A, B or C, or name a font you like.",
    placeholderMobile: "Pick A, B or C.",
  },
  wordmark: { items: [{ id: "pick", kind: "visitor", text: "A, Young Serif." }, wordmark], placeholder: "Approve the wordmark, or ask for a change.", placeholderMobile: "Approve, or ask for a change." },
  held: {
    items: [
      wordmark,
      { id: "ask", kind: "visitor", text: "Can the symbol be a paintbrush?" },
      { id: "kept", kind: "gala", text: "A paintbrush could work. I’ll keep it for the symbol, which comes right after this. We’re still on the wordmark: approve it, or tell me what to change in the type." },
    ],
    placeholder: "Approve the wordmark, or ask for a change.",
    placeholderMobile: "Approve, or ask for a change.",
  },
  opener: {
    items: [
      { id: "approve", kind: "visitor", text: "Use this wordmark." },
      {
        id: "opener",
        kind: "symbolOpener",
        data: {
          say: "Wordmark approved. Now the symbol: a shape that stands on its own beside the name, with no letters in it. What are you picturing? From your research, a few ideas to start from: the oven’s arch, a bread peel, loaves rising. Tell me one of those, something of your own, or say go ahead and I’ll draw three.",
        },
      },
    ],
    placeholder: "Describe a symbol, or say go ahead.",
    placeholderMobile: "Describe a symbol, or say go ahead.",
  },
  lockup: { items: [{ id: "approve", kind: "visitor", text: "Approve Hearth." }, lockupCard("sideBySide")], placeholder: "Approve the lockup, or ask for a change.", placeholderMobile: "Approve, or ask for a change." },
  // Not drawn in the design file: the lockup card with Stacked selected, for a look at the build's reading of it.
  lockupStacked: { items: [lockupCard("stacked")], placeholder: "Approve the lockup, or ask for a change.", placeholderMobile: "Approve, or ask for a change." },
  directions: { items: [visitorBrief, conceptSet], placeholder: "Pick A, B or C, or tell me what to change.", placeholderMobile: "Pick A, B or C." },
  variations: {
    items: [
      {
        id: "variations",
        kind: "variationSet",
        data: {
          say: "Three refinements of Hearth. 2 is the heaviest and holds best at 16px; 3 tries the mark with your type.",
          chosenId: null,
          concepts: [
            { id: "1", letter: "1", name: "Narrow", rationale: "A narrower arch and a smaller flame. More elegant, a little weaker small.", markUrl: marks.narrow, checks: [{ label: "16px", pass: false }, ...pass("Circle", "Inverted")] },
            { id: "2", letter: "2", name: "Heavy", rationale: "A wider arch and a tighter flame. The strongest of the three at 16px.", markUrl: marks.heavy, checks: pass("16px", "Circle", "Inverted") },
            { id: "3", letter: "3", name: "Mark and name", rationale: "The arch over the name in Young Serif. Tests the balance of mark and type.", markUrl: marks.withName, checks: pass("16px", "Circle", "Inverted") },
          ],
        },
      },
    ],
    placeholder: "Pick 1, 2 or 3, or ask for a change.",
    placeholderMobile: "Pick 1, 2 or 3.",
  },
  stress: {
    items: [{ id: "go", kind: "visitor", text: "Go with A. Test it before we refine it." }, stressTest],
    placeholder: "Approve Hearth, or ask for a change.",
    placeholderMobile: "Approve, or change it.",
  },
  pickColors: {
    items: [stressTest, { id: "picker", kind: "colorPicker", data: { say: colorPickerSay, colors: { primary: PRIMARY, secondary: SECONDARY, tertiary: TERTIARY }, saved: false } }],
    placeholder: "Or describe your colors in words.",
    placeholderMobile: "Or describe your colors in words.",
  },
  color: {
    items: [
      { id: "picker", kind: "colorPicker", data: { say: colorPickerSay, colors: { primary: PRIMARY, secondary: SECONDARY, tertiary: TERTIARY }, saved: true } },
      {
        id: "colorways",
        kind: "colorwaySet",
        data: {
          say: "Three colorways with your colors. A lets the primary lead and reads well on white; keep the secondary for backgrounds, not text.",
          brandName: BRAND,
          family: "Young Serif",
          colors: { primary: PRIMARY, secondary: SECONDARY, tertiary: TERTIARY },
          chosenId: null,
          colorways: [
            { id: "a", letter: "A", name: "Primary-led", rationale: "The mark in primary, the name in tertiary. Strongest on white and on signage.", ground: "#FFFFFF", markUrl: tinted(hearthRaw, PRIMARY), wordmarkColor: TERTIARY, roles: ["Primary", "Tertiary"] },
            { id: "b", letter: "B", name: "Dark ground", rationale: "Secondary on a tertiary ground. Built for dark menus, merch and night signs.", ground: TERTIARY, markUrl: tinted(hearthRaw, SECONDARY, TERTIARY), wordmarkColor: SECONDARY, roles: ["Tertiary", "Secondary"] },
            { id: "c", letter: "C", name: "Quiet", rationale: "Mostly tertiary, with primary on the name. The quietest of the three.", ground: "#FFFFFF", markUrl: tinted(hearthRaw, TERTIARY), wordmarkColor: PRIMARY, roles: ["Tertiary", "Primary"] },
          ],
        },
      },
    ],
    placeholder: "Pick A, B or C, or ask for other colors.",
    placeholderMobile: "Pick A, B or C.",
  },
  kit: { items: [kit], placeholder: "Ask for a change, or start a new project.", placeholderMobile: "Ask for a change." },
  // Wordmark only (Figma 5656:16820): the colorways and the kit with the name alone.
  nameOnly: {
    items: [
      {
        id: "colorways",
        kind: "colorwaySet",
        data: {
          say: "Three colorways with your colors. A sets the name in tertiary and reads well on white; keep the secondary for backgrounds, not text.",
          brandName: BRAND,
          family: "Young Serif",
          letterSpacingEm: 0,
          colors: { primary: PRIMARY, secondary: SECONDARY, tertiary: TERTIARY },
          chosenId: null,
          colorways: [
            { id: "a", letter: "A", name: "Tertiary-led", rationale: "The name in tertiary. Strongest on white and on signage.", ground: "#FFFFFF", wordmarkColor: TERTIARY, roles: ["Tertiary"] },
            { id: "b", letter: "B", name: "Dark ground", rationale: "Secondary on a tertiary ground. Built for dark menus, merch and night signs.", ground: TERTIARY, wordmarkColor: "#FFFFFF", roles: ["Secondary", "Tertiary"] },
            { id: "c", letter: "C", name: "Primary-led", rationale: "The name in primary. The warmest of the three.", ground: "#FFFFFF", wordmarkColor: PRIMARY, roles: ["Primary"] },
          ],
        },
      },
      {
        id: "kit",
        kind: "kit",
        data: {
          say: "Your wordmark kit is ready. You have it in color, all black and all white, in SVG and EPS, plus a quick-reference sheet for your hex and CMYK values.",
          lockups: [
            { label: "Wordmark", previewUrl: lockup("", TERTIARY, 0, 26), ground: "white" },
            { label: "All black", previewUrl: lockup("", "#000000", 0, 26), ground: "white" },
            { label: "All white", previewUrl: lockup("", "#FFFFFF", 0, 26), ground: "black" },
          ],
          formats: ["SVG", "EPS", "PNG", "Square", "Social"],
        },
      },
    ],
    placeholder: "Ask for a change, or start a new project.",
    placeholderMobile: "Ask for a change.",
  },
  picks: {
    items: [
      kit,
      {
        id: "picks",
        kind: "picks",
        data: {
          say: "One last thing, and it’s optional.",
          drafts: [marks.rising, marks.peel, marks.wheat, marks.badge, marks.narrow, marks.heavy, marks.withName, marks.hearth].map((markUrl, index) => ({ id: String(index), markUrl })),
          finalMarkUrl: tinted(heavyRaw, PRIMARY),
          answered: null,
        },
      },
    ],
    placeholder: "Ask for a change, or start a new project.",
    placeholderMobile: "Ask for a change.",
  },
};

const ladder = (role: string, base: string, steps: string[]) => ({ role, base, steps: steps.map((hex, index) => ({ step: index === 0 ? 50 : index * 100, hex })) });

/** Each work-panel view in the frames. */
export const panels: Record<string, PanelView> = {
  history: {
    view: "history",
    projectName: BRAND,
    kitReady: false,
    formats: ["SVG", "EPS", "PNG", "Square", "Social"],
    phases: [
      { key: "brief", name: "Brief", summary: "Ember & Rye, a wood-fired bakery in Madison", status: "done" },
      { key: "research", name: "Research", summary: "6 competitors and 4 neighbors reviewed", status: "done" },
      { key: "type", name: "Type", summary: "Young Serif · Serif, Old Style Garalde", status: "done" },
      { key: "wordmark", name: "Wordmark", summary: "Ember & Rye in Young Serif, as typed", status: "done" },
      { key: "directions", name: "Directions", summary: "3 directions, waiting on your pick", status: "current", thumbs: [marks.hearth, marks.peel, marks.rising] },
      { key: "variations", name: "Variations", summary: "Three refinements of your pick", status: "upcoming" },
      { key: "stressTest", name: "Stress test", summary: "16px, circle, inverted, poster", status: "upcoming" },
      { key: "lockup", name: "Lockup", summary: "Symbol and wordmark, side by side and stacked", status: "upcoming" },
      { key: "color", name: "Color", summary: "Palette and three colorways", status: "upcoming" },
      { key: "kit", name: "Kit", summary: "SVG, EPS, PNG, square and social images", status: "upcoming" },
    ],
  },
  artifact: {
    view: "artifact",
    heading: "Directions",
    letter: "A",
    name: "Hearth",
    rationale: "Holds its shape at 16px, and reads as a bakery before you read the name. The flame cut stays open when the mark is inverted.",
    markUrl: marks.hearth,
    checks: pass("16px", "Circle", "Inverted", "Distinct"),
  },
  color: {
    view: "color",
    colors: [
      { role: "Primary", use: "The mark and headlines", hex: PRIMARY },
      { role: "Secondary", use: "Backgrounds and accents", hex: SECONDARY },
      { role: "Tertiary", use: "Text and outlines", hex: TERTIARY },
    ],
  },
  type: {
    view: "type",
    letter: "A",
    brandName: BRAND,
    replacing: "Replacing Young Serif in direction A. The other two stay as they are.",
    categories: ["All", "Serif", "Sans", "Display", "Handwriting"],
    selectedCategory: "All",
    moods: ["Sincere", "Rugged", "Vintage", "Calm", "Business"],
    selectedMoods: ["Sincere", "Rugged"],
    sortNote: "Sorted by sincere and rugged, from Google’s own tags.",
    families: [
      { family: "Young Serif", category: "Serif · Old Style Garalde", current: true },
      { family: "Bitter", category: "Serif · Scotch", current: false },
      { family: "Alegreya Sans", category: "Sans · Humanist", current: false },
      { family: "Instrument Serif", category: "Serif · Modern", current: false },
      { family: "Fraunces", category: "Serif · Old Style Garalde", current: false },
      { family: "Work Sans", category: "Sans · Neo Grotesque", current: false },
    ],
  },
  kit: {
    view: "kit",
    brandName: BRAND,
    clearSpace: { previewUrl: lockup(tinted(heavyRaw, PRIMARY), TERTIARY, 40, 18), zoneColor: "#B83B1C", caption: "Keep clear space equal to the flame’s height on every side." },
    minimumSizes: [
      { item: "Icon", value: "16px" },
      { item: "Primary lock-up", value: "120px wide" },
      { item: "Wordmark", value: "80px wide" },
    ],
    type: { family: "Young Serif", caption: "Young Serif · the wordmark and headings. Free under the Open Font License." },
    ladders: [
      ladder("Primary", PRIMARY, ["#FBF3F1", "#F5E3DF", "#EAC4BB", "#DDA092", "#CF7964", "#C3583D", "#B83A1B", "#902D15", "#6B2210", "#4A170B"]),
      ladder("Secondary", SECONDARY, ["#FDFBF5", "#FBF5E8", "#F7E9CE", "#F2DCB1", "#ECCD90", "#E7C174", "#E3B65C", "#B18E48", "#846A35", "#5B4925"]),
      ladder("Tertiary", TERTIARY, ["#F2F2F2", "#E1E1E0", "#BFBEBD", "#999795", "#6F6B69", "#4B4743", "#2B2622", "#221E1B", "#191614", "#110F0E"]),
    ],
  },
  memory: {
    view: "memory",
    lines: [
      { id: "1", group: "About you", text: "Designs for food and hospitality brands in the Midwest." },
      { id: "2", group: "About you", text: "Likes to see three directions at a time, not more." },
      { id: "3", group: "Your taste", text: "Leans toward heavy, geometric marks and warm serifs." },
      { id: "4", group: "Your taste", text: "Avoids script lettering and gradients." },
      { id: "5", group: "From past projects", text: "Ember & Rye: picked the hearth mark, set in Young Serif." },
    ],
  },
};

const hallEntry = (id: string, brandName: string, mark: string, quote: string | null = null): HallEntry => ({ id, brandName, markUrl: mark, quote });

export const halls: { fame: HallEntry[]; shame: HallEntry[] } = {
  fame: [
    hallEntry("f1", "Kiln Ceramics", marks.heavy),
    hallEntry("f2", "Stack House", marks.rising),
    hallEntry(
      "f3",
      BRAND,
      tinted(hearthRaw, PRIMARY),
      "“It looks like the oven. That’s the whole bakery in one shape. We tried a dozen versions with a freelancer last year and none felt like us; this one did on the first afternoon.”",
    ),
    hallEntry("f4", "Pilot Light Coffee", marks.badge),
    hallEntry("f5", "Hearth & Hound", marks.hearth),
    hallEntry("f6", "Arch Street Books", marks.narrow),
    hallEntry("f7", "Tiered Cakes", marks.rising),
    hallEntry("f8", "Forge Fitness", marks.heavy),
    hallEntry("f9", "Night Owl Bagels", marks.badge),
  ],
  shame: [
    hallEntry("s1", "E&R Bakery", marks.monogram),
    hallEntry("s2", "Lantern Tea", marks.narrow),
    hallEntry("s3", "Pile Up Burgers", marks.rising),
    hallEntry("s4", "Campfire Kids", marks.badge),
    hallEntry(
      "s5",
      BRAND,
      marks.wheat,
      "“Too many little lines. At menu size it looked like a hairball, and printed on a paper bag it turned into a gray smudge. Gala flagged it before I did, which was a little humbling.”",
    ),
    hallEntry("s6", "Kiln Ceramics", marks.hearth),
    hallEntry("s7", "Sheaf Farm", marks.wheat),
    hallEntry("s8", "E&R", marks.monogram),
    hallEntry("s9", "Lighthouse Swim", marks.narrow),
  ],
};

export const projects = [
  { brandName: BRAND, stageLabel: "Kit ready", status: "done" as const, updatedLabel: "Updated today", markUrl: tinted(heavyRaw, PRIMARY) },
  { brandName: "Kiln Ceramics", stageLabel: "Choosing colors", status: "inProgress" as const, updatedLabel: "Updated yesterday", markUrl: marks.heavy },
  { brandName: "Gala", stageLabel: "Stress test", status: "inProgress" as const, updatedLabel: "Updated Nov 23", markUrl: marks.narrow },
  { brandName: "Pilot Light Coffee", stageLabel: "Three directions", status: "inProgress" as const, updatedLabel: "Updated Nov 22", markUrl: marks.badge },
  { brandName: "Lantern Tea", stageLabel: "Brief started", status: "notStarted" as const, updatedLabel: "Updated Nov 21", markUrl: null },
];
