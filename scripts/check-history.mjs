#!/usr/bin/env node
/**
 * The pre-submission check: is any of Gala's real prompt in this
 * repository, in any commit on any branch?
 *
 *   node scripts/check-history.mjs private/gala-prompt.md
 *
 * It needs the local, uncommitted draft of the real prompt to know what to
 * look for. Two passes:
 *   1. `git grep`, over every commit, for each distinctive line of the
 *      prompt, as written.
 *   2. Every version of every file in history is squeezed to letters and
 *      digits and searched for any 48-character run of the squeezed
 *      prompt, the same test guard.ts applies to Gala's replies. This
 *      catches a copy that was re-wrapped, re-indented or re-punctuated.
 * Text that is also in the public stand-in prompt (the identity block) is
 * not secret and is skipped.
 *
 * What this does not prove: a paraphrase, a translation or an encoded copy
 * would pass. It also only sees this clone: branches that exist only on
 * another machine are not searched.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/check-history.mjs <the local draft of the real prompt>");
  process.exit(1);
}

const WINDOW = 48;
const squeeze = (text) => text.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
const git = (args, options = {}) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024, ...options });

const secret = readFileSync(file, "utf8");
const standIn = git(["show", "HEAD:engine/standin-prompt.ts"]);
const publicSqueezed = squeeze(standIn);

// Pass 1: distinctive lines. A line counts when it is long enough to be
// unmistakable and is not part of the public stand-in.
const lines = [...new Set(secret.split("\n").map((line) => line.trim()))].filter((line) => line.length >= 40 && !publicSqueezed.includes(squeeze(line)));
const commits = git(["rev-list", "--all"]).trim().split("\n").filter(Boolean);
let linesFound = 0;
let linesChecked = 0;
for (const line of lines) {
  let hit = false;
  // git grep takes revisions as arguments; search them in batches.
  for (let start = 0; start < commits.length && !hit; start += 200) {
    try {
      git(["grep", "-q", "-F", "-e", line, ...commits.slice(start, start + 200)], { stdio: ["ignore", "ignore", "ignore"] });
      hit = true;
    } catch (error) {
      if (error.status !== 1) throw error; // 1 means "not found"; anything else is a failed search
    }
  }
  linesChecked++;
  if (hit) linesFound++;
}

// Pass 2: every blob in history, squeezed, against every 48-character run.
const windows = new Set();
const squeezedSecret = squeeze(secret);
for (let start = 0; start + WINDOW <= squeezedSecret.length; start++) {
  const window = squeezedSecret.slice(start, start + WINDOW);
  if (!publicSqueezed.includes(window)) windows.add(window);
}
const blobs = [...new Set(git(["rev-list", "--all", "--objects"]).trim().split("\n").map((entry) => entry.split(" ")[0]))];
const types = git(["cat-file", "--batch-check"], { input: blobs.join("\n") }).trim().split("\n");
const blobIds = types.filter((entry) => entry.split(" ")[1] === "blob").map((entry) => entry.split(" ")[0]);
let blobsFound = 0;
let blobsChecked = 0;
for (const id of blobIds) {
  const content = squeeze(execFileSync("git", ["cat-file", "blob", id], { maxBuffer: 1024 * 1024 * 1024 }).toString("utf8"));
  let hit = false;
  for (let start = 0; start + WINDOW <= content.length && !hit; start++) hit = windows.has(content.slice(start, start + WINDOW));
  blobsChecked++;
  if (hit) blobsFound++;
}

console.log(`History check over ${commits.length} commits`);
console.log(`  git grep: ${linesChecked}/${lines.length} distinctive lines searched, ${linesFound} found`);
console.log(`  squeezed scan: ${blobsChecked}/${blobIds.length} file versions searched, ${blobsFound} with a copied run`);
const complete = linesChecked === lines.length && blobsChecked === blobIds.length && lines.length > 0 && blobIds.length > 0;
const clean = linesFound === 0 && blobsFound === 0;
if (!complete) {
  console.log("run incomplete");
  process.exit(1);
}
console.log(clean ? `${lines.length + blobIds.length}/${lines.length + blobIds.length} passed: nothing of the prompt is in history` : `FAILED: the prompt is in history (${linesFound} lines, ${blobsFound} file versions)`);
process.exit(clean ? 0 : 1);
