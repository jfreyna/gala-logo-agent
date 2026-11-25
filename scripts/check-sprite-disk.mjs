#!/usr/bin/env node
/**
 * Is any of Gala's real prompt on the Sprite's disk?
 *
 *   node scripts/check-sprite-disk.mjs private/gala-prompt.md
 *
 * Every distinctive line of the local draft is searched for, as written,
 * in every file under /home/sprite on the Sprite (packages excluded). The
 * lines travel over stdin to `grep` and are never written there.
 *
 * What this proves: no file under the Sprite's home holds a line of the
 * prompt as written. What it does not: a reformatted copy, or one outside
 * /home/sprite. The prompt is in the server's memory while Gala runs; that
 * is by design and is not what this checks.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/check-sprite-disk.mjs <the local draft of the real prompt>");
  process.exit(1);
}
const sprite = process.env.SPRITE_BIN ?? `${homedir()}/.local/bin/sprite`;
const squeeze = (text) => text.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
const standIn = squeeze(readFileSync(new URL("../engine/standin-prompt.ts", import.meta.url), "utf8"));
const lines = [...new Set(readFileSync(file, "utf8").split("\n").map((line) => line.trim()))].filter((line) => line.length >= 40 && !standIn.includes(squeeze(line)));

// A control: the same search must find the stand-in's first line, which is deployed. Otherwise the search itself is broken.
const control = "The real persona prompt, the instructions for each step and the hall";
const run = (patterns) => spawnSync(sprite, ["exec", "-s", process.env.GALA_SPRITE ?? "gala", "--", "grep", "-rlF", "--exclude-dir=node_modules", "-f", "-", "/home/sprite"], { input: patterns.join("\n") + "\n", encoding: "utf8" });

const controlRun = run([control]);
const controlFound = (controlRun.stdout ?? "").split("\n").filter((path) => path.startsWith("/home/sprite")).length;
const searched = run(lines);
const found = (searched.stdout ?? "").split("\n").filter((path) => path.startsWith("/home/sprite"));

console.log(`Sprite disk check: ${lines.length} distinctive lines of the prompt searched under /home/sprite`);
console.log(`  control (a line of the public stand-in, which is deployed): found in ${controlFound} file(s)`);
if (controlFound === 0 || ![0, 1].includes(searched.status ?? -1)) {
  console.log("0/1, run incomplete (the search did not run as expected)");
  process.exit(1);
}
console.log(`  files holding a line of the real prompt: ${found.length}`);
for (const path of found) console.log(`    ${path}`);
console.log(found.length === 0 ? "1/1 passed: no prompt text on the Sprite's disk" : "0/1 passed");
process.exit(found.length === 0 ? 0 : 1);
