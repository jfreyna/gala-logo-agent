#!/usr/bin/env node
/**
 * Button and chip states (FRI-1715), as the browser draws them, against the
 * component sets' own values (gala-button 5666:18006, gala-filter-chip
 * 5548:7011), light and dark.
 *
 *   node scripts/check-states.mjs
 *
 * Runs in a headless browser against the dev preview (GALA_PREVIEW_URL,
 * default http://localhost:3000) on /preview/states, where each control is
 * a real button with the studio's classes. For each state the check forces
 * the pseudo-class the state is (:hover, :active, :focus-visible) through
 * the browser's DevTools protocol, or relies on the disabled attribute,
 * then reads the computed fill, border, text and focus ring and compares
 * them with the hex values the component set uses.
 *
 * What this proves: Primary, Secondary and Link each draw Default, Hover,
 * Pressed, Focus and Disabled as designed, and the chip its seven states,
 * in both modes; disabled controls don't take hover; changes ease over
 * 120ms. What it does not prove: the label sizes, which the visual gate
 * covers, or that every button in the studio uses these classes (a grep
 * in the PR does).
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.GALA_PREVIEW_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const hex = (value) => {
  const match = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(value);
  if (match === null) return value;
  if (match[4] !== undefined && Number(match[4]) === 0) return "none";
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
};

/**
 * What each state draws, from the component sets. fill and border are
 * hexes ("none" for transparent); text is the label's color; ring the focus
 * outline's color; underline true when the words are underlined.
 */
const EXPECT = {
  light: {
    Primary: {
      Default: { fill: "#633ba4", text: "#fafafa" },
      Hover: { fill: "#7f55c3", text: "#fafafa" },
      Pressed: { fill: "#451d87", text: "#fafafa" },
      Focus: { fill: "#633ba4", ring: "#3b7187" },
      Disabled: { fill: "#f6f0ff", text: "#8db3c4" },
    },
    Secondary: {
      Default: { fill: "none", border: "#bddcea", text: "#262626" },
      Hover: { fill: "#ffffff", border: "#bddcea", text: "#262626" },
      Pressed: { fill: "#bddcea", border: "#3b7187", text: "#262626" },
      Focus: { fill: "none", ring: "#3b7187" },
      Disabled: { fill: "none", border: "#d6e8f0", text: "#8db3c4" },
    },
    Link: {
      Default: { text: "#3b7187", underline: false },
      Hover: { text: "#3b7187", underline: true },
      Pressed: { text: "#451d87", underline: true },
      Focus: { text: "#3b7187", ring: "#3b7187" },
      Disabled: { text: "#8db3c4", underline: false },
    },
    Chip: {
      Default: { fill: "none", border: "#bddcea", text: "#8db3c4" },
      Selected: { fill: "#bddcea", border: "#bddcea", text: "#262626" },
      Hover: { fill: "#ffffff", border: "#3b7187", text: "#262626" },
      "Selected hover": { fill: "#bddcea", border: "#3b7187", text: "#262626" },
      Focus: { ring: "#3b7187" },
      Disabled: { border: "#d6e8f0", opacity: "0.6" },
      "Selected disabled": { fill: "#bddcea", opacity: "0.6" },
    },
  },
  dark: {
    Primary: {
      Default: { fill: "#7f55c3", text: "#fafafa" },
      Hover: { fill: "#8a4ded", text: "#fafafa" },
      Pressed: { fill: "#633ba4", text: "#fafafa" },
      Focus: { fill: "#7f55c3", ring: "#bddcea" },
      Disabled: { fill: "#2c0668", text: "#6c97aa" },
    },
    Secondary: {
      Default: { fill: "none", border: "#3b7187", text: "#d6e8f0" },
      Hover: { fill: "#022e40", border: "#3b7187", text: "#d6e8f0" },
      Pressed: { fill: "#1d576f", border: "#bddcea", text: "#d6e8f0" },
      Focus: { fill: "none", ring: "#bddcea" },
      Disabled: { fill: "none", border: "#1d576f", text: "#6c97aa" },
    },
    Link: {
      Default: { text: "#bddcea", underline: false },
      Hover: { text: "#bddcea", underline: true },
      Pressed: { text: "#633ba4", underline: true },
      Focus: { text: "#bddcea", ring: "#bddcea" },
      Disabled: { text: "#6c97aa", underline: false },
    },
    Chip: {
      Default: { fill: "none", border: "#3b7187", text: "#6c97aa" },
      Selected: { fill: "#1d576f", border: "#1d576f", text: "#d6e8f0" },
      Hover: { fill: "#022e40", border: "#bddcea", text: "#d6e8f0" },
      "Selected hover": { fill: "#1d576f", border: "#bddcea", text: "#d6e8f0" },
      Focus: { ring: "#bddcea" },
      Disabled: { border: "#1d576f", opacity: "0.6" },
      "Selected disabled": { fill: "#1d576f", opacity: "0.6" },
    },
  },
};

/** The pseudo-classes each state forces. Disabled is the attribute itself. */
const FORCE = { Hover: ["hover"], "Selected hover": ["hover"], Pressed: ["hover", "active"], Focus: ["focus", "focus-visible"] };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const checks = [];
for (const mode of ["light", "dark"]) {
  for (const [kind, states] of Object.entries(EXPECT[mode])) {
    for (const [state, expected] of Object.entries(states)) checks.push({ mode, kind, state, expected });
  }
}
checks.push({ special: "ease" });

let passed = 0;
const pages = {};
async function pageFor(mode) {
  if (pages[mode]) return pages[mode];
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 600 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: mode }]);
  await page.goto(`${BASE}/preview/states`, { waitUntil: "networkidle0" });
  const cdp = await page.createCDPSession();
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  pages[mode] = { page, cdp };
  return pages[mode];
}

console.log(`Button and chip states, as drawn (${BASE}): ${checks.length} checks`);
for (const check of checks) {
  const name = check.special ? "every state change eases over 120ms" : `${check.mode} ${check.kind} ${check.state}`;
  try {
    if (check.special) {
      const { page } = await pageFor("light");
      const durations = await page.$$eval("[data-kind]", (controls) => [...new Set(controls.map((control) => getComputedStyle(control).transitionDuration))]);
      if (durations.join() !== "0.12s") throw new Error(`transition durations: ${durations.join(", ")}`);
    } else {
      const { page, cdp } = await pageFor(check.mode);
      const selector = `[data-kind="${check.kind}"][data-state="${check.state}"]`;
      const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error("no such control on the page");
      await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: FORCE[check.state] ?? [] });
      // Wait out the 120ms ease so the colors read are the settled ones.
      await new Promise((resolve) => setTimeout(resolve, 200));
      const drawn = await page.$eval(selector, (control) => {
        const style = getComputedStyle(control);
        const label = control.querySelector("span") ?? control;
        const labelStyle = getComputedStyle(label);
        return {
          fill: style.backgroundColor,
          border: style.borderTopWidth === "0px" ? "none" : style.borderTopColor,
          text: labelStyle.color,
          ring: style.outlineStyle === "none" ? "none" : style.outlineColor,
          underline: getComputedStyle(control).textDecorationLine.includes("underline") || labelStyle.textDecorationLine.includes("underline"),
          opacity: style.opacity,
        };
      });
      await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
      const wrong = Object.entries(check.expected).filter(([key, value]) => {
        const actual = key === "underline" || key === "opacity" ? drawn[key] : hex(drawn[key]);
        return String(actual) !== String(value);
      });
      if (wrong.length > 0) throw new Error(wrong.map(([key, value]) => `${key} ${key === "underline" || key === "opacity" ? drawn[key] : hex(drawn[key])}, expected ${value}`).join("; "));
    }
    passed++;
    console.log(`  ok    ${name}`);
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
  }
}
await browser.close();
console.log(passed === checks.length ? `${passed}/${checks.length} passed` : `${passed}/${checks.length} passed (${checks.length - passed} failed)`);
process.exit(passed === checks.length ? 0 : 1);
