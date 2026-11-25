#!/usr/bin/env node
/**
 * A whole turn that runs with no sign-in token: the case of a turn that
 * outlives the person's token.
 *
 *   node scripts/check-turn.mjs
 *
 * How: a made-up person (the Convex CLI can run functions as one on a dev
 * deployment) starts a project, says something, and a turn is opened for
 * them, which is the one step that needs a sign-in. Then the engine on the
 * Sprite runs that turn against the real models and the real storage
 * routes holding only the shared secret and the turn's id. The person's
 * side then reads what Gala wrote.
 *
 * What this proves: once a turn is open, nothing in it needs the person's
 * token again. Gala's working line, card and the release of the lock all
 * go through the routes on the turn's id, so a token that runs out
 * mid-turn cannot stop it. It also shows the working line the brief step
 * sets, as the studio would read it.
 *
 * What it does not prove: opening a turn with a real token (`/engine/begin`
 * through the route, and `/api/turn` on the server), which needs a person
 * to sign in. It leaves its project on the dev deployment, owned by an
 * identity no one can sign in as.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";

const sprite = process.env.SPRITE_BIN ?? `${homedir()}/.local/bin/sprite`;
const spriteName = process.env.GALA_SPRITE ?? "gala";
/** The engine's folder on the Sprite, and the settings file its server reads. */
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
const turnId = randomUUID();
let ended = "";
const workingLines = new Set();

check("a person starts a project and says something; a turn is opened for them", () => {
  projectId = run("projects:create", {}, person);
  run("messages:send", { projectId, text: "Ember & Rye, a wood-fired bakery in Madison. Never: fussy, corporate, cute." }, person);
  const opened = run("engine:begin", { subject: person.subject, projectId, turnId });
  expect(opened.busy === false && run("projects:get", { projectId }, person).turnStartedAt !== null, "the turn did not open");
});

check("the engine runs the turn on the Sprite with the shared secret and the turn's id, and no token", async () => {
  const engine = spawn(sprite, ["exec", "--no-stdin", "-s", spriteName, "--", "sh", "-c", `cd ${engineDir} && node --env-file=${settings} engine/checks/turn-on-id.ts ${projectId} ${turnId}`]);
  let output = "";
  engine.stdout.on("data", (chunk) => (output += chunk));
  engine.stderr.on("data", (chunk) => (output += chunk));
  const finished = new Promise((resolve) => engine.on("close", resolve));
  // While it runs, read the project the way the studio does, to catch the working line.
  let running = true;
  void finished.then(() => (running = false));
  while (running) {
    const project = run("projects:get", { projectId }, person);
    if (project.working) workingLines.add(project.working);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  ended = /turn ended: (\w+)/.exec(output)?.[1] ?? "";
  expect(ended === "done", `the engine reported: ${output.trim().split("\n").pop()}`);
});

check("Gala's card is in the conversation, written to the person's own project", () => {
  const messages = run("messages:list", { projectId }, person);
  const card = messages.find((message) => message.author === "gala" && message.kind === "brief");
  expect(card !== undefined && /ember/i.test(card.artifact.brand ?? ""), `messages: ${JSON.stringify(messages.map((message) => message.kind))}`);
});

check("the lock was released and the project no longer waits on Gala", () => {
  const project = run("projects:get", { projectId }, person);
  expect(project.turnStartedAt === null && project.working === null && project.waitingOnGala === false, JSON.stringify(project));
});

check('while the brief step ran, the studio could read its working line, "Reading your brief"', () => {
  expect(workingLines.has("Reading your brief"), `working lines seen: ${JSON.stringify([...workingLines])}`);
});

check("the turn's id is spent: it writes nothing after the turn is closed", () => {
  let message = null;
  try {
    run("engine:write", { projectId, turnId, operations: [{ op: "say", text: "After the end." }] });
  } catch (error) {
    message = error.message;
  }
  expect(message !== null && message.includes("This turn is over."), `refusal: ${message}`);
});

let passed = 0;
let ran = 0;
console.log(`Turn on its id alone: ${checks.length} checks (engine: ${engineDir} on Sprite "${spriteName}")`);
for (const { name, fn } of checks) {
  ran++;
  try {
    await fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
  }
}
console.log(ran === checks.length ? `${passed}/${checks.length} passed` : `${passed}/${checks.length}, run incomplete`);
process.exit(passed === checks.length ? 0 : 1);
