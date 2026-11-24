// Contact sheet in the gala-kit card's layout (234x140 papers, 12px gaps), for PR screenshots.
// node scripts/contact-sheet.mjs <kitDir> <out.png> [card|all]
import fs from "node:fs";
import resvg from "@resvg/resvg-js";
const dir = process.argv[2], out = process.argv[3], variantSet = process.argv[4] ?? "card";
const read = (p) => fs.readFileSync(`${dir}/${p}`, "utf8");
function nest(file, x, y, w, h, fit) {
  const t = read(file);
  const vb = t.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
  const inner = t.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<title>[\s\S]*?<\/title>/, "");
  const s = Math.min((w * fit) / vb[2], (h * fit) / vb[3]);
  const iw = vb[2] * s, ih = vb[3] * s;
  return `<svg x="${x + (w - iw) / 2}" y="${y + (h - ih) / 2}" width="${iw}" height="${ih}" viewBox="${vb.join(" ")}">${inner}</svg>`;
}
const S = "ember-and-rye";
let tiles;
if (variantSet === "card") {
  tiles = [["primary-color", "Primary", 0.78], ["stacked-color", "Stacked", 0.62], ["icon-color", "Icon", 0.52], ["wordmark-color", "Wordmark", 0.8], ["primary-black", "All black", 0.78], ["primary-white", "All white", 0.78]];
} else {
  tiles = [];
  for (const l of ["primary", "stacked", "icon", "wordmark"]) for (const v of ["color", "black", "white"]) tiles.push([`${l}-${v}`, `${l} · ${v}`, l === "icon" ? 0.52 : l === "stacked" ? 0.62 : 0.8]);
}
const W = 234, H = 140, G = 12, cols = 3, rows = Math.ceil(tiles.length / cols);
const width = 16 * 2 + cols * W + (cols - 1) * G, height = 16 * 2 + rows * (H + 30) + (rows - 1) * G - 10;
let body = `<rect width="${width}" height="${height}" rx="16" fill="#e7f3f8"/>`;
tiles.forEach(([f, label, fit], i) => {
  const x = 16 + (i % cols) * (W + G), y = 16 + Math.floor(i / cols) * (H + 30 + G);
  const dark = f.endsWith("white");
  body += `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="12" fill="${dark ? "#000" : "#fff"}"/>`;
  body += nest(`svg/${S}-${f}.svg`, x, y, W, H, fit);
  body += `<text x="${x}" y="${y + H + 20}" font-family="DejaVu Sans, sans-serif" font-size="13" fill="#5a8aa0">${label}</text>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
fs.writeFileSync(out, new resvg.Resvg(svg, { fitTo: { mode: "zoom", value: 2 }, font: { loadSystemFonts: true } }).render().asPng());
console.log(out, width, height);
