import { useEffect } from "react";

/**
 * Loads a Google Fonts family for a short piece of text. With `text`, Google
 * sends only the glyphs that text needs, so a wordmark can preview in dozens
 * of families cheaply. Each family and text pair is requested once.
 */
const requested = new Set<string>();

export function googleFontHref(family: string, text?: string): string {
  const params = new URLSearchParams({ family, display: "swap" });
  if (text !== undefined) params.set("text", text);
  return `https://fonts.googleapis.com/css2?${params.toString()}`;
}

/** Every weight, upright and italic, for the older CSS API, which sends the styles a family has and skips the rest. */
const EVERY_STYLE = [100, 200, 300, 400, 500, 600, 700, 800, 900].flatMap((weight) => [`${weight}`, `${weight}i`]).join(",");

/**
 * The stylesheet for a family with no Regular (Buda is Light only, Molle
 * italic only). The address above asks for Regular and Google refuses it
 * for such a family; this one asks for every style, and the browser then
 * draws the nearest weight, the same one the kit draws.
 */
export function googleFontFallbackHref(family: string, text?: string): string {
  const params = new URLSearchParams({ family: `${family}:${EVERY_STYLE}`, display: "swap" });
  if (text !== undefined) params.set("text", text);
  return `https://fonts.googleapis.com/css?${params.toString()}`;
}

export function useGoogleFont(family: string, text?: string): void {
  useEffect(() => {
    const href = googleFontHref(family, text);
    if (requested.has(href)) return;
    requested.add(href);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onerror = () => {
      link.onerror = null;
      link.href = googleFontFallbackHref(family, text);
    };
    document.head.appendChild(link);
  }, [family, text]);
}
