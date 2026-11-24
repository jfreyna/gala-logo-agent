/**
 * Writes a full kit for a mark to a folder, for looking at the files.
 *
 *   npm run fixture -- [mark] [outDir]
 *
 * Defaults: fixtures/spike_mark.png into out/fixture. Uses the draft
 * Ember & Rye name, Young Serif and the `gala-palette` frame's colors.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildKit } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const markPath = process.argv[2] ?? join(here, "../fixtures/spike_mark.png");
const outDir = process.argv[3] ?? join(here, "../out/fixture");

const t0 = Date.now();
const kit = await buildKit({
  mark: { bytes: new Uint8Array(readFileSync(markPath)), mime: "image/png" },
  name: "Ember & Rye",
  fontFamily: "Young Serif",
  colors: { primary: "#B83A1B", secondary: "#E3B65C", tertiary: "#2B2622" },
  colorway: { mark: "primary", wordmark: "tertiary" },
});
for (const f of kit.files) {
  const dest = join(outDir, f.path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, f.bytes);
}
writeFileSync(join(outDir, "spec.json"), JSON.stringify(kit.spec, null, 2));
console.log(`${kit.files.length} files and spec.json in ${outDir} (${Date.now() - t0} ms)`);
