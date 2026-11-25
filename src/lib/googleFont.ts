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

export function useGoogleFont(family: string, text?: string): void {
  useEffect(() => {
    const href = googleFontHref(family, text);
    if (requested.has(href)) return;
    requested.add(href);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }, [family, text]);
}
