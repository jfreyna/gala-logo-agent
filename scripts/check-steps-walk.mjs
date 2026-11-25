#!/usr/bin/env node
/**
 * A walk from brief to kit, one sign-off at a time, on the dev deployment.
 *
 *   node scripts/check-steps-walk.mjs
 *
 * How: as scripts/check-turn.mjs does. A made-up person (the Convex CLI can
 * run functions as one on a dev deployment) starts a project, and does what
 * a person does in the studio: sends messages and presses the buttons on
 * the cards, through the same functions the page calls. After each action a
 * turn is opened for them, and the engine on the Sprite runs it against the
 * real models and the real storage routes.
 *
 * What this proves, on one made-up brief: the project stops at every step
 * until it is signed off; the wordmark shows after the typeface and before
 * any symbol; a request for the symbol made during the wordmark is held
 * and comes back in Gala's line at the symbol opener; nothing is drawn
 * until "go ahead"; the lockup shows after the stress test and before
 * color; "Change symbol" goes back from the lockup to the directions and
 * keeps the later cards as history; and the kit is built at the end.
 *
 * What it does not prove: the studio page itself (no browser is used, so no
 * click is made on a real button), a signed-in person's token, other
 * briefs, or how any card looks. It leaves its project on the dev
 * deployment, owned by an identity no one can sign in as. Each turn draws
 * and judges with real models, so the run takes several minutes and a
 * model that is out of reach fails the step it was on.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";

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

const stage = () => run("projects:get", { projectId }, person).stage;
const messages = () => run("messages:list", { projectId }, person);
const say = (text) => run("messages:send", { projectId, text }, person);
const press = (messageId, action) => run("studio:act", { projectId, messageId, action }, person);
/** The newest card of a kind. */
const newest = (kind) => messages().findLast((message) => message.kind === kind);
/** The step and the kinds of card after it, for the transcript. */
const note = (label) => console.log(`        ${label}: stage ${stage()}; cards ${messages().filter((message) => message.artifact !== null).map((message) => message.kind).join(" > ")}`);

check("brief: the person describes the brand, and the brief is taken in", async () => {
  projectId = run("projects:create", {}, person);
  say("Ember & Rye, a wood-fired bakery in Madison for neighbors and weekend visitors. No tagline. The logo goes on the shop sign, paper bags and Instagram. Never: fussy, corporate, cute.");
  await turn();
  // The brief asks for whatever is missing, one or two things at a time.
  for (let asked = 0; asked < 3 && stage() === "brief"; asked++) {
    say("That covers it. Leave anything else blank and go on.");
    await turn();
  }
  expect(stage() === "research", `stage is ${stage()}`);
  expect(newest("direction")?.artifact.approved === false, "no direction waiting for approval");
  note("after the brief");
});

check("research: the direction waits; approving it opens type, and no further", async () => {
  press(newest("direction")._id, { type: "approveDirection" });
  await turn();
  expect(stage() === "type", `stage is ${stage()}`);
  const set = newest("typeSet").artifact;
  expect(set.directions.length === 3 && set.chosenId === null, "no three typefaces waiting for a pick");
  expect(newest("wordmark") === undefined, "a wordmark showed before a typeface was picked");
  note("after the direction");
});

check("type: picking a typeface shows the wordmark, the name on its own, and stops there", async () => {
  const set = newest("typeSet");
  press(set._id, { type: "chooseType", id: set.artifact.directions[0].id });
  await turn();
  expect(stage() === "wordmark", `stage is ${stage()}`);
  const card = newest("wordmark").artifact;
  expect(card.approved === false && card.family === set.artifact.directions[0].family && card.brandName === "Ember & Rye", `the wordmark card: ${JSON.stringify({ approved: card.approved, family: card.family, name: card.brandName })}`);
  expect(newest("symbolOpener") === undefined && newest("conceptSet") === undefined, "the symbol started before the wordmark was signed off");
  note("after the typeface");
});

check("wordmark: a request for the symbol is held, the stage stays, and the wordmark is still not signed off", async () => {
  say("Can the symbol be a bread peel?");
  await turn();
  expect(stage() === "wordmark", `stage is ${stage()}`);
  expect(newest("wordmark").artifact.approved === false, "the wordmark was approved");
  expect(newest("conceptSet") === undefined, "a symbol was drawn");
  const last = messages().at(-1);
  expect(last.author === "gala" && last.kind === "text", "Gala did not answer in words");
  note("after the held request");
});

check("wordmark: all capitals, said in words, changes the Case on a new card; a chip puts it back; neither signs it off", async () => {
  say("Try it in all capitals.");
  await turn();
  let card = newest("wordmark");
  expect(stage() === "wordmark" && card.artifact.case === "allCaps" && card.artifact.brandName === "EMBER & RYE" && card.artifact.approved === false, `the wordmark card: ${JSON.stringify({ stage: stage(), case: card.artifact.case, name: card.artifact.brandName })}`);
  press(card._id, { type: "setWordmark", case: "asTyped" });
  card = newest("wordmark");
  expect(card.artifact.case === "asTyped" && card.artifact.brandName === "Ember & Rye" && card.artifact.approved === false, "the chip did not put the name back as typed");
  expect(stage() === "wordmark", `stage is ${stage()}`);
});

check("wordmark: the sign-off opens the symbol, and Gala's opening line brings the bread peel back; nothing is drawn", async () => {
  press(newest("wordmark")._id, { type: "approveWordmark" });
  await turn();
  expect(stage() === "symbolOpener", `stage is ${stage()}`);
  const opener = newest("symbolOpener").artifact;
  expect(/peel/i.test(opener.say), "Gala's opening line does not mention the bread peel");
  expect(opener.answered === null && newest("conceptSet") === undefined, "the directions were drawn before the person answered");
  note("after the wordmark sign-off");
});

check("symbol opener: go ahead draws three directions, and stops for a pick", async () => {
  say("Go ahead.");
  await turn();
  expect(stage() === "directions", `stage is ${stage()}`);
  const set = newest("conceptSet").artifact;
  expect(set.concepts.length >= 1 && set.chosenId === null, "no directions waiting for a pick");
  note("after go ahead");
});

/** From three directions to the stress test's sign-off, by the buttons and one spoken approval. */
async function toTheLockup() {
  const directions = newest("conceptSet");
  press(directions._id, { type: "chooseConcept", id: directions.artifact.concepts[0].id });
  await turn();
  expect(stage() === "variations", `after picking a direction the stage is ${stage()}`);
  const variations = newest("variationSet");
  expect(variations.artifact.chosenId === null, "a variation was chosen for the person");
  press(variations._id, { type: "chooseVariation", id: variations.artifact.concepts[0].id });
  await turn();
  expect(stage() === "stressTest" && newest("stressTest").artifact.approved !== true, `after picking a variation the stage is ${stage()}`);
  expect(newest("colorPicker") === undefined || messages().findLastIndex((m) => m.kind === "colorPicker") < messages().findLastIndex((m) => m.kind === "stressTest"), "color opened before the stress test was approved");
  say("Approved. Use this mark.");
  await turn();
}

check("directions to stress test: each pick moves one step; approving the mark shows the lockup, not color", async () => {
  await toTheLockup();
  expect(stage() === "lockup", `stage is ${stage()}`);
  const card = newest("lockup").artifact;
  expect(card.approved === false && card.layout === "sideBySide" && card.spaceBetween === "asSet", `the lockup card: ${JSON.stringify({ approved: card.approved, layout: card.layout })}`);
  expect(newest("colorPicker") === undefined, "color opened before the lockup was signed off");
  note("after the stress test");
});

check("lockup: Change symbol goes back to the directions, the same three with nothing chosen, and the later cards stay as history", async () => {
  const before = messages();
  const first = before.find((message) => message.kind === "conceptSet");
  await turn("directions");
  expect(stage() === "directions", `stage is ${stage()}`);
  const again = newest("conceptSet");
  expect(again._id !== first._id && again.artifact.chosenId === null, "no new directions card with nothing chosen");
  expect(again.artifact.concepts.map((concept) => concept.id).join() === first.artifact.concepts.map((concept) => concept.id).join(), "the directions are not the same three");
  const kinds = messages().map((message) => message.kind);
  expect(["variationSet", "stressTest", "lockup"].every((kind) => kinds.includes(kind)), "a later card was removed");
  expect(newest("colorPicker") === undefined, "color opened");
  note("after going back");
});

check("lockup again: said in words, stacked changes the Layout on a new card; the sign-off opens color", async () => {
  await toTheLockup();
  expect(stage() === "lockup", `stage is ${stage()}`);
  say("Put the name underneath the symbol.");
  await turn();
  const card = newest("lockup");
  expect(stage() === "lockup" && card.artifact.layout === "stacked" && card.artifact.approved === false, `the lockup card: ${JSON.stringify({ stage: stage(), layout: card.artifact.layout, approved: card.artifact.approved })}`);
  press(card._id, { type: "approveLockup" });
  await turn();
  expect(stage() === "pickColors", `stage is ${stage()}`);
  expect(newest("colorPicker").artifact.saved === false, "the colors were saved for the person");
  note("after the lockup sign-off");
});

check("color to kit: saved colors show three colorways; a pick builds the kit", async () => {
  press(newest("colorPicker")._id, { type: "saveColors", primary: "#B83A1B", secondary: "#E3B65C", tertiary: "#2B2622" });
  await turn();
  expect(stage() === "colorways", `stage is ${stage()}`);
  const set = newest("colorwaySet");
  expect(set.artifact.colorways.length === 3 && set.artifact.chosenId === null, "no three colorways waiting for a pick");
  press(set._id, { type: "chooseColorway", id: set.artifact.colorways[0].id });
  await turn();
  expect(stage() === "picks", `stage is ${stage()}`);
  const kit = run("kits:forProject", { projectId }, person);
  expect(kit !== null && kit.files.length > 0, "no kit was stored");
  expect(newest("kit").artifact.lockups.length === 6, "the kit card does not show six lock-ups");
  note("after the kit");
});

let passed = 0;
let ran = 0;
console.log(`Brief to kit, one sign-off at a time: ${checks.length} checks (engine: ${engineDir} on Sprite "${spriteName}")`);
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
