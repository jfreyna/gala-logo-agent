#!/usr/bin/env node
/**
 * Cards and history on the dev deployment (FRI-1713): every card action
 * leaves its line and wakes Gala; past cards refuse changes; a typeface
 * change after the type step goes back through a turn and redraws.
 * Failures answered (FRI-1714): refusals come back in the server's own
 * words; a color typeface is answered with a notice, and the same failure
 * twice with Repeated.
 *
 *   node --experimental-strip-types --no-warnings scripts/check-feedback-walk.mjs
 *
 * How: as scripts/check-steps-walk.mjs does. A made-up person (the Convex
 * CLI can run functions as one on a dev deployment) starts a project and
 * presses the buttons on the cards through the same functions the page
 * calls; after each, a turn is opened for them and the engine on the
 * Sprite (GALA_SPRITE_DIR, the scratch copy for a branch) runs it against
 * the real models and the real storage routes. Which cards are past is
 * read with the studio's own rule (src/studio/history.ts).
 *
 * What this proves, on one made-up brief: `act` stores each action's line
 * on the person's side, with no text, and marks Gala as owed a turn; the
 * engine answers after it as it would after a press; a chip leaves no
 * line; a change to the type card from the wordmark step is refused, not
 * saved silently; "Back to this step" on the type card goes back, and the
 * new pick redraws the wordmark, which names the weight it is drawn in.
 *
 * What it does not prove: the page (no browser; scripts/check-cards.mjs
 * covers what it draws), a real sign-in, or other briefs. It leaves its
 * project on the dev deployment, owned by an identity no one can sign in as.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { pastCards } from "../src/studio/history.ts";

const sprite = process.env.SPRITE_BIN ?? `${homedir()}/.local/bin/sprite`;
const spriteName = process.env.GALA_SPRITE ?? "gala";
const engineDir = process.env.GALA_SPRITE_DIR ?? "/home/sprite/gala";
const settings = process.env.GALA_SPRITE_ENV ?? "/home/sprite/gala.env";

const person = { subject: `check|${randomUUID()}`, issuer: "https://check.invalid" };

function run(name, args = {}, identity = null) {
  const result = spawnSync("npx", ["convex", "run", name, JSON.stringify(args), "--typecheck", "disable", "--codegen", "disable", ...(identity ? ["--identity", JSON.stringify(identity)] : [])], { encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout).trim().replace(/\s+/g, " "));
  const text = result.stdout.trim();
  return text === "" ? null : JSON.parse(text);
}

const checks = [];
const check = (name, fn) => checks.push({ name, fn });
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

let projectId;

/** Opens a turn for the person and has the engine on the Sprite run it. `back` is a "Back to this step" press. */
async function turn(back) {
  const turnId = randomUUID();
  const opened = run("engine:begin", { subject: person.subject, projectId, turnId });
  expect(opened.busy === false, "the turn did not open");
  const engine = spawn(sprite, ["exec", "--no-stdin", "-s", spriteName, "--", "sh", "-c", `cd ${engineDir} && node --env-file=${settings} --experimental-strip-types --no-warnings engine/checks/turn-on-id.ts ${projectId} ${turnId}${back ? ` ${back}` : ""}`]);
  let output = "";
  engine.stdout.on("data", (chunk) => (output += chunk));
  engine.stderr.on("data", (chunk) => (output += chunk));
  await new Promise((resolve) => engine.on("close", resolve));
  const ended = /turn ended: (\w+)/.exec(output)?.[1] ?? "";
  expect(ended === "done", `the engine reported: ${output.trim().split("\n").pop()}`);
}

const project = () => run("projects:get", { projectId }, person);
const stage = () => project().stage;
const messages = () => run("messages:list", { projectId }, person);
const say = (text) => run("messages:send", { projectId, text }, person);
const press = (messageId, action) => run("studio:act", { projectId, messageId, action }, person);
const newest = (kind) => messages().findLast((message) => message.kind === kind);
const echoes = () => messages().filter((message) => message.kind === "action");
const past = () => pastCards(messages().map((message) => ({ id: message._id, author: message.author, kind: message.kind, artifact: message.artifact })), stage());

/** The line the last press left: the newest message, on the person's side, with no text. */
function lastLine() {
  const last = messages().at(-1);
  expect(last.author === "visitor" && last.kind === "action", `the newest message is ${last.author} ${last.kind}, not the action's line`);
  expect(last.text === null, `the line has text: ${JSON.stringify(last.text)}`);
  return last.artifact;
}

check("brief to research: the direction waits for Looks right", async () => {
  projectId = run("projects:create", {}, person);
  say("Ember & Rye, a wood-fired bakery in Madison for neighbors and weekend visitors. No tagline. The logo goes on the shop sign, paper bags and Instagram. Never: fussy, corporate, cute.");
  await turn();
  for (let asked = 0; asked < 3 && stage() === "brief"; asked++) {
    say("That covers it. Leave anything else blank and go on.");
    await turn();
  }
  expect(stage() === "research", `stage is ${stage()}`);
});

check("Looks right leaves its line at once and wakes Gala; Gala's turn answers after it", async () => {
  press(newest("direction")._id, { type: "approveDirection" });
  const line = lastLine();
  expect(line.sending === "Direction looks right" && line.sent === "Direction looks right" && line.wakes === true, `the line: ${JSON.stringify(line)}`);
  expect(project().waitingOnGala === true, "Gala is not owed a turn");
  await turn();
  expect(stage() === "type", `stage is ${stage()}`);
  const all = messages();
  expect(all.findLastIndex((message) => message.author === "gala") > all.findLastIndex((message) => message.kind === "action"), "Gala did not answer after the line");
  expect(past()[newest("direction")._id]?.signedOff === true, "the direction card is not signed off");
});

check("Choose leaves Picked and the family; the wordmark that follows names the weight it is drawn in", async () => {
  const set = newest("typeSet");
  const family = set.artifact.directions[0].family;
  press(set._id, { type: "chooseType", id: set.artifact.directions[0].id });
  const line = lastLine();
  expect(line.sent === `Picked ${family}` && line.sending === `Picking ${family}` && line.wakes === true, `the line: ${JSON.stringify(line)}`);
  await turn();
  expect(stage() === "wordmark", `stage is ${stage()}`);
  const card = newest("wordmark").artifact;
  expect(card.family === family && Number.isInteger(card.weight) && card.weight >= 100 && card.weight <= 900, `the wordmark card: ${JSON.stringify({ family: card.family, weight: card.weight })}`);
});

check("a chip changes the card and leaves no line", async () => {
  const before = echoes().length;
  press(newest("wordmark")._id, { type: "setWordmark", case: "allCaps" });
  expect(newest("wordmark").artifact.case === "allCaps", "the chip did not change the card");
  expect(echoes().length === before, "the chip left a line");
  press(newest("wordmark")._id, { type: "setWordmark", case: "asTyped" });
});

check("at the wordmark step, a change to the type card is refused, not saved silently (gap C)", async () => {
  const set = newest("typeSet");
  const before = { chosenId: set.artifact.chosenId, lines: echoes().length };
  let refused = "";
  try {
    press(set._id, { type: "chooseType", id: set.artifact.directions[1].id });
  } catch (error) {
    refused = error.message;
  }
  expect(/That step is done\./.test(refused), `the change was not refused: ${refused || "it went through"}`);
  expect(newest("typeSet").artifact.chosenId === before.chosenId, "the type card changed");
  expect(echoes().length === before.lines, "a refused change left a line");
  expect(stage() === "wordmark", `stage is ${stage()}`);
});

check("Back to this step on the type card goes back through a turn; the old type card and wordmark are history", async () => {
  const oldType = newest("typeSet");
  const oldWordmark = newest("wordmark");
  expect(past()[oldType._id]?.backTo === "type", "the type card does not offer Back to this step");
  await turn("type");
  expect(stage() === "type", `stage is ${stage()}`);
  const fresh = newest("typeSet");
  expect(fresh._id !== oldType._id && fresh.artifact.chosenId === null, "no new type card waiting for a pick");
  const now = past();
  expect(now[fresh._id] === undefined, "the new type card is not live");
  expect(now[oldType._id]?.signedOff === true && now[oldWordmark._id]?.signedOff === false && now[oldWordmark._id]?.backTo === null, `the old cards: ${JSON.stringify([now[oldType._id], now[oldWordmark._id]])}`);
});

check("picking another typeface redraws the wordmark in it; the first wordmark stays in the conversation", async () => {
  const set = newest("typeSet");
  const firstWordmark = newest("wordmark");
  const family = set.artifact.directions[1].family;
  press(set._id, { type: "chooseType", id: set.artifact.directions[1].id });
  expect(lastLine().sent === `Picked ${family}`, "the pick left no line");
  await turn();
  expect(stage() === "wordmark", `stage is ${stage()}`);
  const card = newest("wordmark");
  expect(card._id !== firstWordmark._id && card.artifact.family === family, `the wordmark: ${JSON.stringify({ family: card.artifact.family })}`);
  expect(messages().some((message) => message._id === firstWordmark._id), "the first wordmark was removed");
});

/** Runs a call that should be refused, and returns the words it was refused with ("" when it went through). */
function refused(call) {
  try {
    call();
  } catch (error) {
    return error.message;
  }
  return "";
}

// Failures answered (FRI-1714): the server's own words, thrown so a production deployment passes them on.

check("a refused card action comes back in the server's own words, as a ConvexError", async () => {
  const oldType = messages().find((message) => message.kind === "typeSet");
  const words = refused(() => press(oldType._id, { type: "chooseType", id: oldType.artifact.directions[2].id }));
  expect(/ConvexError/.test(words) && /That step is done\./.test(words), `refused with: ${words || "it went through"}`);
});

check("a message over 4,000 characters is refused in plain words, and nothing is stored", async () => {
  const before = messages().length;
  const words = refused(() => say("x".repeat(4001)));
  expect(/That message is too long\./.test(words), `refused with: ${words || "it went through"}`);
  expect(messages().length === before, "something was stored");
});

check("a memory line over the limit is refused in plain words", async () => {
  const words = refused(() => run("memories:add", { group: "About you", text: "x".repeat(2000) }, person));
  expect(/That line is too long\./.test(words), `refused with: ${words || "it went through"}`);
});

check("a color typeface picked from the tray is un-picked, with a Couldn't notice and Choose another typeface", async () => {
  await turn("type");
  expect(stage() === "type", `stage is ${stage()}`);
  const set = newest("typeSet");
  const a = set.artifact.directions[0].id;
  press(set._id, { type: "useFamily", id: a, family: "Noto Color Emoji", category: "Display", moods: "" });
  press(set._id, { type: "chooseType", id: a });
  await turn();
  const notice = newest("notice");
  expect(notice?.author === "gala" && notice.artifact.cause === "color" && notice.artifact.kind === "couldnt", `the notice: ${JSON.stringify(notice?.artifact)}`);
  expect(notice.artifact.actions[0].label === "Choose another typeface" && /color typeface/.test(notice.artifact.say), `the notice: ${JSON.stringify(notice.artifact)}`);
  expect(stage() === "type" && newest("typeSet").artifact.chosenId === null, "the pick was not undone");
});

check("the same failure again at the type step is Repeated: a step back, and no retry", async () => {
  const set = newest("typeSet");
  press(set._id, { type: "chooseType", id: set.artifact.directions[0].id });
  await turn();
  const notice = newest("notice").artifact;
  expect(notice.kind === "repeated" && notice.actions.map((action) => action.label).join() === "Go back to Research,Tell me what to try", `the notice: ${JSON.stringify(notice)}`);
});

let passed = 0;
let ran = 0;
console.log(`Cards, history and failures on dev: ${checks.length} checks (engine: ${engineDir} on Sprite "${spriteName}")`);
for (const { name, fn } of checks) {
  ran++;
  try {
    await fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
    // Each step builds on the one before: a failed step ends the walk, and the count says so.
    break;
  }
}
console.log(ran === checks.length && passed === checks.length ? `${passed}/${checks.length} passed` : ran === checks.length ? `${passed}/${checks.length} passed (${ran - passed} failed)` : `${passed}/${checks.length}, run incomplete`);
if (projectId) console.log(`project: ${projectId}`);
process.exit(passed === checks.length ? 0 : 1);
