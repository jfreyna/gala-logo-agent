/**
 * A brand's own site icon, for the research cards.
 *
 * Given the brand's website, this tries, in order: the site's
 * apple-touch-icon or its largest `<link rel="icon">`, then its og:image,
 * then /favicon.ico, then the same site's icon from Google's public favicon
 * service (for sites that turn readers away). The first image at least
 * about 128px on its short side is kept, downscaled to at most 256px, as
 * PNG. Nothing found means null, and the card shows its designed default
 * image.
 *
 * The address comes from a model's search, so it is treated as untrusted.
 * Only the site's origin is fetched: whatever path, query, fragment or
 * userinfo the model wrote is dropped and never sent, and the host itself
 * is kept short, because the name still reaches DNS. Then, as for every
 * address fetched here: only https on the standard port, only host names (no addresses typed in
 * as numbers), every name must resolve to public addresses only, redirects
 * are followed by hand and checked the same way, every answer is capped in
 * size and time. That keeps it off the Sprite's own connectors and any
 * private network. The address is checked again when each connection is
 * made, by the lookup the connection itself uses, so a name that resolves
 * differently between the check and the fetch (DNS rebinding) is refused.
 *
 * What this does not prove: that a site icon is the brand's full logo; many
 * are app icons.
 */
import type { LookupAddress, LookupOptions } from "node:dns";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { rasterize } from "../kit/src/render.ts";

/** About 128px on the short side; a few pixels under still counts. */
const MIN_SIDE = 120;
const STORED_SIDE = 256;
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

/**
 * The longest host a model may name, and the most labels in it. A brand's
 * home host is short (www.brand.co.uk has four labels), and a host name
 * isn't a message: a long one could carry words out to a DNS server in its
 * labels. 63 characters is a single DNS label's own ceiling, ample for a
 * real brand's host.
 */
const MAX_HOST_LENGTH = 63;
const MAX_HOST_LABELS = 4;

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number) as [number, number];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  const lower = address.toLowerCase();
  if (lower === "::" || lower === "::1") return false;
  if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb") || lower.startsWith("ff")) return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPublicAddress(mapped[1]!);
  return true;
}

/** The address as a URL Gala may fetch, or null. */
export async function safeUrl(raw: string, base?: URL): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || (url.port !== "" && url.port !== "443") || url.username !== "" || url.password !== "") return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0 || !host.includes(".") || host.endsWith(".internal") || host.endsWith(".local") || host === "localhost") return null;
  try {
    const addresses = await lookup(host, { all: true });
    if (addresses.length === 0 || !addresses.every((entry) => isPublicAddress(entry.address))) return null;
  } catch {
    return null;
  }
  return url;
}

/**
 * The site's origin, https://host/, from the address a model wrote, or
 * null. Path, query, fragment and userinfo are dropped. A scheme other
 * than https (or http, read as https), another port, or a host that is
 * too long, has too many labels or isn't made of plain labels is refused
 * before any lookup.
 */
export function originOf(site: string): string | null {
  const text = site.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || (url.port !== "" && url.port !== "443")) return null;
  const host = url.hostname.toLowerCase();
  const labels = host.split(".");
  if (host.length > MAX_HOST_LENGTH || labels.length > MAX_HOST_LABELS || !labels.every((label) => /^[a-z0-9-]+$/.test(label))) return null;
  return `https://${host}/`;
}

/** Refused at connect time: the name resolved to an address that is not public. */
export class PrivateAddressError extends Error {}

/**
 * The lookup the connection itself uses, so the address checked is the
 * address connected to: a name that answers with a public address for the
 * check and a private one for the fetch (DNS rebinding) is refused here.
 */
export function publicOnlyLookup(
  hostname: string,
  options: LookupOptions,
  callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  lookup(hostname, { all: true }).then(
    (addresses) => {
      if (addresses.length === 0 || !addresses.every((entry) => isPublicAddress(entry.address))) {
        callback(new PrivateAddressError(`${hostname} resolves to an address that is not public`), "", 0);
        return;
      }
      if (options.all === true) callback(null, addresses);
      else callback(null, addresses[0]!.address, addresses[0]!.family);
    },
    (error: NodeJS.ErrnoException) => callback(error, "", 0),
  );
}

type Answer = { status: number; type: string; location: string | null; bytes: Uint8Array | null };

/** One request on the connect-time lookup. The body is read only when `wantBody` says so, and capped. */
function request(url: URL, signal: AbortSignal, wantBody: (status: number, type: string) => boolean): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const outgoing = httpsRequest(
      { hostname: url.hostname, port: 443, path: `${url.pathname}${url.search}`, method: "GET", lookup: publicOnlyLookup, signal, headers: { "User-Agent": "Gala site icon reader", Accept: "*/*", "Accept-Encoding": "identity" } },
      (response) => {
        const status = response.statusCode ?? 0;
        const type = String(response.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
        const location = typeof response.headers.location === "string" ? response.headers.location : null;
        if (!wantBody(status, type) || Number(response.headers["content-length"] ?? "0") > MAX_BYTES) {
          response.destroy();
          resolve({ status, type, location, bytes: null });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            response.destroy();
            resolve({ status, type, location, bytes: null });
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ status, type, location, bytes: new Uint8Array(Buffer.concat(chunks)) }));
        response.on("error", reject);
      },
    );
    outgoing.on("error", reject);
    outgoing.end();
  });
}

/**
 * Fetches a checked URL, following checked redirects. Each connection
 * looks the name up again and refuses a non-public address. The body is
 * capped.
 */
export async function get(start: URL, signal?: AbortSignal, options: { errorPage?: boolean } = {}): Promise<{ url: URL; type: string; bytes: Uint8Array } | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    // A site that turns readers away often still sends its page, with its icon links; only a page is read that way, never an image.
    const wanted = (status: number, type: string) => (status >= 200 && status < 300) || (options.errorPage === true && status >= 400 && type.includes("html"));
    const answer = await request(url, signal ? AbortSignal.any([signal, timeout]) : timeout, wanted).catch(() => null);
    if (answer === null) return null;
    if (answer.status >= 300 && answer.status < 400) {
      const checked = answer.location === null ? null : await safeUrl(answer.location, url);
      if (checked === null) return null;
      url = checked;
      continue;
    }
    if (answer.bytes === null) return null;
    return { url, type: answer.type, bytes: answer.bytes };
  }
  return null;
}

/** The value of an attribute in one tag's text. */
function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match === null ? null : (match[2] ?? match[3] ?? match[4] ?? "").trim();
}

const decodeEntities = (text: string) => text.replace(/&amp;/g, "&").replace(/&#38;/g, "&").replace(/&quot;/g, '"');

/** The image addresses a page offers, best first: touch icons and sized icons by size, then og:image. */
export function candidatesIn(html: string): string[] {
  const head = html.slice(0, 200_000);
  const icons: { href: string; size: number; touch: boolean }[] = [];
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attribute(tag, "rel") ?? "").toLowerCase().split(/\s+/);
    const href = attribute(tag, "href");
    if (href === null || href === "") continue;
    const touch = rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed");
    if (!touch && !rel.includes("icon")) continue;
    const sizes = (attribute(tag, "sizes") ?? "").toLowerCase();
    const size = sizes === "any" ? 512 : Math.max(0, ...sizes.split(/\s+/).map((entry) => Number(entry.split("x")[0]) || 0));
    icons.push({ href: decodeEntities(href), size: touch && size === 0 ? 180 : size, touch });
  }
  icons.sort((a, b) => Number(b.touch) - Number(a.touch) || b.size - a.size);
  const og: string[] = [];
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const property = (attribute(tag, "property") ?? attribute(tag, "name") ?? "").toLowerCase();
    const content = attribute(tag, "content");
    if ((property === "og:image" || property === "og:image:secure_url") && content) og.push(decodeEntities(content));
  }
  return [...new Set([...icons.map((icon) => icon.href), ...og])];
}

type Raster = { mime: "image/png" | "image/jpeg" | "image/gif"; bytes: Uint8Array; width: number; height: number };

function pngSize(bytes: Uint8Array): [number, number] | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
}

function jpegSize(bytes: Uint8Array): [number, number] | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1]!;
    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return [(bytes[at + 7]! << 8) | bytes[at + 8]!, (bytes[at + 5]! << 8) | bytes[at + 6]!];
    }
    at += 2 + length;
  }
  return null;
}

function gifSize(bytes: Uint8Array): [number, number] | null {
  if (bytes.length < 10 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) return null;
  return [bytes[6]! | (bytes[7]! << 8), bytes[8]! | (bytes[9]! << 8)];
}

/** The largest PNG image inside an .ico file. Older bitmap entries are skipped. */
function pngInIco(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 6 || bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 1 || bytes[3] !== 0) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4, true);
  let best: Uint8Array | null = null;
  let bestSide = 0;
  for (let index = 0; index < count && 6 + index * 16 + 16 <= bytes.length; index++) {
    const entry = 6 + index * 16;
    const side = bytes[entry] === 0 ? 256 : bytes[entry]!;
    const size = view.getUint32(entry + 8, true);
    const offset = view.getUint32(entry + 12, true);
    if (offset + size > bytes.length) continue;
    const data = bytes.subarray(offset, offset + size);
    if (pngSize(data) !== null && side > bestSide) {
      best = data;
      bestSide = side;
    }
  }
  return best;
}

/** The fetched bytes as a raster with its size, or null for a format Gala doesn't read. */
function asRaster(bytes: Uint8Array): Raster | null {
  const png = pngSize(bytes);
  if (png) return { mime: "image/png", bytes, width: png[0], height: png[1] };
  const jpeg = jpegSize(bytes);
  if (jpeg) return { mime: "image/jpeg", bytes, width: jpeg[0], height: jpeg[1] };
  const gif = gifSize(bytes);
  if (gif) return { mime: "image/gif", bytes, width: gif[0], height: gif[1] };
  const inIco = pngInIco(bytes);
  return inIco ? asRaster(inIco) : null;
}

const isSvg = (type: string, bytes: Uint8Array) => type === "image/svg+xml" || /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg\b/i.test(new TextDecoder().decode(bytes.subarray(0, 512)));

/** An image scaled to `side` pixels wide, as PNG. */
function scaled(image: { href: string; width: number; height: number }, side: number): Uint8Array {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${image.width} ${image.height}" width="${image.width}" height="${image.height}"><image width="${image.width}" height="${image.height}" xlink:href="${image.href}"/></svg>`;
  return rasterize(svg, side);
}

/** The bytes as a stored PNG at most 256px wide, or null when too small or unreadable. */
export function storable(type: string, bytes: Uint8Array): Uint8Array | null {
  try {
    if (isSvg(type, bytes)) {
      // Drawn only if it refers to nothing outside itself: the renderer would try to load a linked file.
      const text = new TextDecoder().decode(bytes);
      if (/(xlink:)?href\s*=\s*["'](?!#|data:)/i.test(text)) return null;
      return rasterize(text, STORED_SIDE);
    }
    const raster = asRaster(bytes);
    if (raster === null || Math.min(raster.width, raster.height) < MIN_SIDE) return null;
    const href = `data:${raster.mime};base64,${Buffer.from(raster.bytes).toString("base64")}`;
    return scaled({ href, width: raster.width, height: raster.height }, Math.min(STORED_SIDE, raster.width));
  } catch {
    return null;
  }
}

/** The brand's site icon as PNG bytes, or null. Never throws. */
export async function siteIcon(site: string | null, signal?: AbortSignal): Promise<Uint8Array | null> {
  const origin = site === null ? null : originOf(site);
  if (origin === null) return null;
  const home = await safeUrl(origin);
  if (home === null) return null;
  const page = await get(home, signal, { errorPage: true }).catch(() => null);
  const candidates = page !== null && page.type.includes("html") ? candidatesIn(new TextDecoder().decode(page.bytes)) : [];
  const base = page?.url ?? home;
  // Last, Google's public favicon service, which serves the same site's own icon when the site turns readers away.
  const google = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(home.hostname)}&sz=256`;
  for (const candidate of [...candidates, "/favicon.ico", google]) {
    const url = await safeUrl(candidate, base);
    if (url === null) continue;
    const file = await get(url, signal).catch(() => null);
    if (file === null) continue;
    const png = storable(file.type, file.bytes);
    if (png !== null) return png;
  }
  return null;
}

/** A stored icon on white, 320px square, the size Jev reads. */
export function forJudging(png: Uint8Array): Uint8Array {
  const href = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 320 320"><rect width="320" height="320" fill="#FFFFFF"/><image x="32" y="32" width="256" height="256" xlink:href="${href}" preserveAspectRatio="xMidYMid meet"/></svg>`;
  return rasterize(svg, 320);
}
