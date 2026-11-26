/**
 * The colors, type and radii below are the Frilly design system's variables
 * as the Gala frames use them, kept under their Figma names. Each color has a
 * light and a dark member; a component names the one each mode uses, because
 * dark mode in the frames is not always the same token with "-dark" on it.
 */
const colors = {
  "headline-1-light": "#3b7187",
  "headline-1-dark": "#8db3c4",
  "headline-2-light": "#262626",
  "headline-2-dark": "#f5f5f5",
  "text-neutral-1-light": "#262626",
  "text-neutral-1-dark": "#d6e8f0",
  "text-neutral-2-light": "#8db3c4",
  "text-neutral-2-dark": "#6c97aa",
  "text-blue-1-light": "#3b7187",
  "text-blue-1-dark": "#bddcea",
  "text-green-1-light": "#819600",
  "text-green-1-dark": "#b9d700",
  "error-text-light": "#e36316",
  "error-text-dark": "#fea875",
  "background-1-light": "#e7f3f8",
  "background-1-dark": "#021c29",
  "background-2-light": "#f6fafc",
  "background-2-dark": "#022e40",
  "background-3-light": "#bddcea",
  "background-3-dark": "#1d576f",
  "stroke-1-light": "#d6e8f0",
  "stroke-1-dark": "#1d576f",
  "stroke-2-light": "#bddcea",
  "stroke-2-dark": "#3b7187",
  "button-1-default-light": "#633ba4",
  "button-1-default-dark": "#7f55c3",
  /** The other Primary states (gala-button). */
  "button-1-hover-light": "#7f55c3",
  "button-1-hover-dark": "#8a4ded",
  "button-1-pressed-light": "#451d87",
  "button-1-pressed-dark": "#633ba4",
  "button-inactive-light": "#f6f0ff",
  "button-inactive-dark": "#2c0668",
  "button-2-default-dark": "#b9d700",
  "primary-light": "#633ba4",
  "primary-dark": "#d4c1f0",
  "form-background-light": "#fafafa",
  "form-background-dark": "#1d576f",
  "form-stroke-light": "#8db3c4",
  "form-stroke-dark": "#3b7187",
  "button-light-text": "#fafafa",
  "neutral-0": "#ffffff",
  "neutral-100": "#f5f5f5",
  "neutral-300": "#d4d4d4",
  "neutral-500": "#737373",
  "neutral-900": "#171717",
  /** The left rule on gala-notice, the same in both modes. */
  "warning-400": "#f0c000",
  "brand-secondary-50": "#f4f7e3",
  "brand-tertiary-50": "#f6fafc",
  "brand-tertiary-200": "#d6e8f0",
  "brand-tertiary-700": "#1d576f",
  "brand-tertiary-900": "#021c29",
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // Hover states show on pointer devices only: a tap on a phone leaves no stuck hover.
  future: { hoverOnlyWhenSupported: true },
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors,
      fontFamily: {
        headings: ['"Space Grotesk"', "system-ui", "sans-serif"],
        body: ['"Kumbh Sans"', "system-ui", "sans-serif"],
      },
      screens: {
        // The frames are drawn at 380 (mobile) and 1440 (desktop). The split is the
        // Frilly design system's: phone layouts below 768px.
        desktop: "768px",
      },
    },
  },
  plugins: [],
};
