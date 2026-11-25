/**
 * Sets the wordmark in a Google Fonts family and converts it to outlines, so
 * no file in the kit depends on an installed font and no font file ships.
 *
 * The font comes from the Google Fonts CSS API as TrueType. Asking for a
 * weight returns a static instance even for variable families. The license
 * and category are read from the family's METADATA.pb in the google/fonts
 * repository. Only those two hosts and fonts.gstatic.com are ever fetched;
 * a font URL on any other host is refused.
 *
 * Reach (gate 3b): kerning is applied (opentype.js reads `kern` and GPOS
 * pair kerning); contextual alternates and complex shaping are not, so a
 * script that needs shaping (Arabic, Devanagari) would set incorrectly. A
 * name with a character the font lacks fails loudly instead of drawing the
 * missing-glyph box.
 */

import opentype from "opentype.js";
import { parsePath, type Segment } from "./path.ts";

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }>;

export type FontInfo = {
  family: string;
  weight: number;
  category: string | null;
  license: "OFL" | "Apache-2.0" | "UFL" | null;
  licenseName: string | null;
};

export type LoadedFont = { info: FontInfo; font: opentype.Font };

const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 ]{0,63}$/;
const FONT_HOST = "fonts.gstatic.com";
// An old user agent makes the CSS API answer with TrueType rather than WOFF2.
const TTF_USER_AGENT = "Mozilla/4.0";

const LICENSES: Record<string, { id: FontInfo["license"]; name: string }> = {
  OFL: { id: "OFL", name: "SIL Open Font License" },
  APACHE2: { id: "Apache-2.0", name: "Apache License 2.0" },
  UFL: { id: "UFL", name: "Ubuntu Font Licence" },
};

const CATEGORIES: Record<string, string> = {
  SERIF: "Serif",
  SANS_SERIF: "Sans serif",
  DISPLAY: "Display",
  HANDWRITING: "Handwriting",
  MONOSPACE: "Monospace",
};

function cssUrl(family: string, weight?: number): string {
  const name = family.trim().replace(/ +/g, "+");
  return `https://fonts.googleapis.com/css2?family=${name}${weight === undefined ? "" : `:wght@${weight}`}`;
}

async function fetchMetadata(family: string, fetcher: FetchLike): Promise<Pick<FontInfo, "category" | "license" | "licenseName">> {
  const slug = family.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const dir of ["ofl", "apache", "ufl"]) {
    try {
      const res = await fetcher(`https://raw.githubusercontent.com/google/fonts/main/${dir}/${slug}/METADATA.pb`);
      if (!res.ok) continue;
      const text = await res.text();
      const lic = LICENSES[text.match(/^license:\s*"(\w+)"/m)?.[1] ?? ""];
      const cat = text.match(/^category:\s*"(\w+)"/m)?.[1];
      return { license: lic?.id ?? null, licenseName: lic?.name ?? null, category: cat ? (CATEGORIES[cat] ?? cat) : null };
    } catch {
      // Metadata is for the spec sheet only; a miss must not stop the kit.
    }
  }
  return { license: null, licenseName: null, category: null };
}

export async function loadFont(family: string, weight: number, fetcher: FetchLike): Promise<LoadedFont> {
  if (!FAMILY.test(family.trim())) throw new Error(`kit: "${family}" is not a Google Fonts family name`);
  if (!Number.isInteger(weight) || weight < 100 || weight > 900) throw new Error(`kit: font weight ${weight} is out of range`);
  const headers = { "User-Agent": TTF_USER_AGENT };
  let res = await fetcher(cssUrl(family, weight), { headers });
  if (!res.ok) res = await fetcher(cssUrl(family), { headers }); // the family has no such weight: use its default
  if (!res.ok) throw new Error(`kit: Google Fonts has no family "${family}" (HTTP ${res.status})`);
  const css = await res.text();
  const src = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]truetype['"]\)/);
  if (!src) throw new Error(`kit: no TrueType source for "${family}"`);
  const url = new URL(src[1]!);
  if (url.protocol !== "https:" || url.hostname !== FONT_HOST) throw new Error(`kit: refusing a font from ${url.hostname}`);
  const servedWeight = Number(css.match(/font-weight:\s*(\d+)/)?.[1] ?? weight);
  const fontRes = await fetcher(url.toString());
  if (!fontRes.ok) throw new Error(`kit: font download failed (HTTP ${fontRes.status})`);
  const font = opentype.parse(await fontRes.arrayBuffer());
  const meta = await fetchMetadata(family, fetcher);
  return { info: { family: family.trim(), weight: servedWeight, ...meta }, font };
}

type Command = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };

function fromCommands(commands: Command[]): Segment[] {
  const d = commands
    .map((c) => {
      const n = (v: number | undefined) => {
        if (v === undefined || !Number.isFinite(v)) throw new Error("kit: the font produced a non-finite coordinate");
        return String(v);
      };
      switch (c.type) {
        case "M":
        case "L":
          return `${c.type}${n(c.x)} ${n(c.y)}`;
        case "Q":
          return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
        case "C":
          return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
        case "Z":
          return "Z";
        default:
          throw new Error(`kit: unexpected font path command ${c.type}`);
      }
    })
    .join(" ");
  return parsePath(d);
}

export type SetText = {
  segments: Segment[];
  /** Cap height in the same units as `segments`, for optical centering. */
  capHeight: number;
};

/**
 * Sets `text` with its baseline at y = 0 at `fontSize` units, as outlines.
 * `letterSpacing` is added after every letter, in ems (0 sets the type as
 * the typeface draws it).
 */
export function setText(loaded: LoadedFont, text: string, fontSize: number, letterSpacing = 0): SetText {
  const { font } = loaded;
  const missing = [...new Set([...text])].filter((ch) => ch.trim() !== "" && font.charToGlyphIndex(ch) === 0);
  if (missing.length > 0) throw new Error(`kit: ${loaded.info.family} has no glyph for ${missing.map((c) => JSON.stringify(c)).join(", ")}`);
  const path = font.getPath(text, 0, 0, fontSize, { kerning: true, ...(letterSpacing !== 0 ? { letterSpacing } : {}) });
  // Read the commands directly: opentype.js 2.0's toPathData rounding emits
  // "NaN" for some sizes (seen at 285.714 units in Young Serif).
  const segments = fromCommands(path.commands);
  if (segments.length === 0) throw new Error("kit: the wordmark has no visible glyphs");
  const os2Cap = (font.tables as { os2?: { sCapHeight?: number } }).os2?.sCapHeight;
  const capUnits = os2Cap && os2Cap > 0 ? os2Cap : (font.charToGlyph("H").getBoundingBox().y2 || font.unitsPerEm * 0.7);
  return { segments, capHeight: (capUnits / font.unitsPerEm) * fontSize };
}
