#!/usr/bin/env node
/**
 * Loads Gala's real prompt into the `frilly-gala` environment.
 *
 *   node scripts/set-prompt.mjs private/gala-prompt.md          (dev)
 *   node scripts/set-prompt.mjs private/gala-prompt.md --prod   (production; the owner's to run)
 *
 * One environment value holds at most 8 KiB, so the text is split across
 * GALA_PROMPT_01, GALA_PROMPT_02 and so on, and convex/prompt.ts joins
 * them. Each piece is piped to the Convex CLI on stdin: the text never
 * appears on a command line, in shell history or in this script's output.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node scripts/set-prompt.mjs <prompt file> [--prod]");
  process.exit(1);
}
const target = flags.includes("--prod") ? ["--prod"] : [];

/** Under the 8 KiB limit, with room to spare. */
const MAX_BYTES = 7000;
const text = readFileSync(file, "utf8").trim();

// Cut only between two non-space characters: if the CLI trims a value's
// edges, nothing is lost when the pieces are joined.
const pieces = [];
let rest = [...text];
while (rest.length > 0) {
  let end = 0;
  let bytes = 0;
  while (end < rest.length && bytes + Buffer.byteLength(rest[end]) <= MAX_BYTES) bytes += Buffer.byteLength(rest[end++]);
  if (end < rest.length) while (end > 1 && (/\s/.test(rest[end - 1]) || /\s/.test(rest[end]))) end--;
  pieces.push(rest.slice(0, end).join(""));
  rest = rest.slice(end);
}
if (pieces.join("") !== text) throw new Error("The pieces do not join back into the prompt.");

const convex = (args, input) => spawnSync("npx", ["convex", "env", ...args, ...target], { input, encoding: "utf8" });
const name = (index) => `GALA_PROMPT_${String(index + 1).padStart(2, "0")}`;

for (const [index, piece] of pieces.entries()) {
  const result = convex(["set", name(index)], piece);
  if (result.status !== 0) {
    console.error(`Could not set ${name(index)} (exit ${result.status}).`);
    process.exit(1);
  }
}

// Remove pieces left over from a longer prompt, so they are not joined on the end.
const listed = convex(["list", "--names-only"]).stdout ?? "";
const stale = [...listed.matchAll(/GALA_PROMPT_(\d+)/g)].map((match) => Number(match[1])).filter((number) => number > pieces.length);
for (const number of stale) convex(["remove", name(number - 1)]);

console.log(`Set ${pieces.length} values (${name(0)} to ${name(pieces.length - 1)}), ${Buffer.byteLength(text)} bytes in all${stale.length > 0 ? `; removed ${stale.length} left over` : ""}. Target: ${target.length > 0 ? "production" : "dev"}.`);
