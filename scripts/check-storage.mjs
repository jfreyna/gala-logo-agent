#!/usr/bin/env node
/**
 * Storage, end to end, as a signed-in person and as Gala's server.
 *
 *   node scripts/check-storage.mjs
 *
 * It runs the Convex functions on the dev deployment through the Convex
 * CLI. The CLI can run a function as a made-up identity on a dev
 * deployment, which is how this plays a person without anyone signing in,
 * and it can run internal functions directly, which is how it plays Gala's
 * server.
 *
 * What this proves: the functions do what the engine and the studio rely
 * on. The turn lock holds, a turn's id reads and writes its own project and
 * no other, Gala's writes are refused once the turn is over, closing always
 * goes through, a card's file ids come back as addresses for the owner, a
 * choice is accepted only if the card offers it, another person can't see
 * or touch the project, and a quote sent to the halls waits for its check.
 *
 * With `--aged-lock` it also opens a turn, waits out the lock's lifetime
 * (a little over 12 minutes) and shows that the turn's id has stopped
 * working. Without the flag that check is reported as not run.
 *
 * What it does not prove: the HTTP routes' own two checks (the shared
 * secret and a real sign-in token), because the CLI calls the functions
 * behind them. The routes' refusals are checked by request, and a real
 * sign-in needs a person. It also leaves its rows behind on the dev
 * deployment, owned by identities no one can sign in as.
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const person = { subject: `check|${randomUUID()}`, issuer: "https://check.invalid" };
const stranger = { subject: `check|${randomUUID()}`, issuer: "https://check.invalid" };

/** Runs one function. Returns its result, or throws with the function's own message. */
function run(name, args = {}, identity = null) {
  const result = spawnSync("npx", ["convex", "run", name, JSON.stringify(args), "--typecheck", "disable", "--codegen", "disable", ...(identity ? ["--identity", JSON.stringify(identity)] : [])], { encoding: "utf8" });
  // The CLI prints the function's message followed by a stack; keep it all on one line.
  if (result.status !== 0) throw new Error((result.stderr || result.stdout).trim().replace(/\s+/g, " "));
  const text = result.stdout.trim();
  return text === "" ? null : JSON.parse(text);
}

/** The function's error message, or null if it did not fail. */
function refusal(name, args, identity = null) {
  try {
    run(name, args, identity);
    return null;
  } catch (error) {
    return error.message;
  }
}

const checks = [];
const check = (name, fn) => checks.push({ name, fn });
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

let projectId;
let fileId;
/** Opening a turn: the route has checked the person's token and passes who they are. */
const opening = (turnId) => ({ subject: person.subject, projectId, turnId });
/** Inside a turn: the turn's id stands for the person. */
const inTurn = (turnId, extra = {}) => ({ projectId, turnId, ...extra });

check("a new project opens with Gala's first line", () => {
  projectId = run("projects:create", {}, person);
  const messages = run("messages:list", { projectId }, person);
  expect(messages.length === 1 && messages[0].author === "gala" && messages[0].text.startsWith("Tell me who you’re building this for"), `messages: ${JSON.stringify(messages)}`);
});

check("a message from the person marks the project as waiting on Gala", () => {
  run("messages:send", { projectId, text: "Ember & Rye, a wood-fired bakery." }, person);
  expect(run("projects:get", { projectId }, person).waitingOnGala === true, "not waiting on Gala");
});

check("opening a turn takes the lock and returns the conversation", () => {
  const opened = run("engine:begin", opening("turn-1"));
  expect(opened.busy === false && opened.messages.length === 2 && opened.project.stage === "brief", JSON.stringify(opened).slice(0, 200));
  expect(run("projects:get", { projectId }, person).working === "", "the studio does not see the turn");
});

check("a second turn on the same project is told it is busy", () => {
  expect(run("engine:begin", opening("turn-2")).busy === true, "the lock did not hold");
});

check("a file the person uploads is stored and recorded", async () => {
  const address = run("uploads:startUpload", { projectId }, person);
  // A one-pixel PNG.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const response = await fetch(address, { method: "POST", headers: { "Content-Type": "image/png" }, body: png });
  fileId = (await response.json()).storageId;
  const uploadId = run("uploads:finishUpload", { projectId, fileId, fileName: "pixel.png" }, person);
  expect(typeof uploadId === "string" && typeof fileId === "string", "no upload recorded");
});

check("Gala's writes land together: a line, a card, a choice, the stage and the working line", () => {
  run(
    "engine:write",
    inTurn("turn-1", {
      operations: [
        { op: "status", text: "Drawing three directions" },
        { op: "say", text: "Three directions, in black and white." },
        { op: "artifact", kind: "conceptSet", ref: "set", artifact: { say: "Pick one.", concepts: [{ id: "a", letter: "A", name: "Hearth", rationale: "Holds at 16px.", markFileId: fileId, checks: [] }], discarded: [], chosenId: null } },
        { op: "choice", step: "directions", discarded: [], messageRef: "set" },
        { op: "project", brandName: "Ember & Rye", stage: "directions" },
      ],
    }),
  );
  const project = run("projects:get", { projectId }, person);
  expect(project.stage === "directions" && project.brandName === "Ember & Rye" && project.working === "Drawing three directions", JSON.stringify(project));
});

check("a card's file id comes back to its owner as an address", () => {
  const card = run("messages:list", { projectId }, person).find((message) => message.kind === "conceptSet");
  expect(typeof card?.artifact.concepts[0].markUrl === "string" && card.artifact.concepts[0].markUrl.startsWith("https://"), "no address for the mark");
});

check("a write from a turn that does not hold the lock is refused", () => {
  const message = refusal("engine:write", inTurn("turn-2", { operations: [{ op: "say", text: "Not mine to write." }] }));
  expect(message !== null && message.includes("This turn is over."), `refusal: ${message}`);
});

check("inside the turn, the turn's id reads the project back; a wrong id reads nothing", () => {
  const read = run("engine:read", inTurn("turn-1"));
  expect(read.project.stage === "directions" && read.messages.some((message) => message.kind === "conceptSet"), JSON.stringify(read.project));
  const wrong = refusal("engine:read", inTurn("not-the-turn"));
  expect(wrong?.includes("This turn is over."), `refusal: ${wrong}`);
  expect(run("engine:holds", inTurn("turn-1")) === true && run("engine:holds", inTurn("not-the-turn")) === false, "holds");
});

check("a turn's id works only on its own project: it cannot write to another", () => {
  const other = run("projects:create", {}, person);
  const message = refusal("engine:write", { projectId: other, turnId: "turn-1", operations: [{ op: "say", text: "Wrong project." }] });
  expect(message?.includes("This turn is over."), `refusal: ${message}`);
  expect(run("messages:list", { projectId: other }, person).length === 1, "something was written to the other project");
});

check("closing under an id that does not hold the lock releases nothing, and is not an error", () => {
  const closed = run("engine:end", inTurn("not-the-turn"));
  expect(closed.released === false && run("engine:holds", inTurn("turn-1")) === true, JSON.stringify(closed));
});

check("ownership is answered for the owner and for no one else", () => {
  expect(run("engine:owns", { subject: person.subject, projectId }) === true && run("engine:owns", { subject: stranger.subject, projectId }) === false, "owns");
});

check("another person can neither read the project nor open a turn on it", () => {
  const read = refusal("messages:list", { projectId }, stranger);
  const turn = refusal("engine:begin", { subject: stranger.subject, projectId, turnId: "turn-3" });
  expect(read?.includes("Project not found.") && turn?.includes("Project not found."), `read: ${read}; turn: ${turn}`);
});

check("a choice is accepted only if the card offers it", () => {
  const card = run("messages:list", { projectId }, person).find((message) => message.kind === "conceptSet");
  const wrong = refusal("studio:act", { projectId, messageId: card._id, action: { type: "chooseConcept", id: "not-on-the-card" } }, person);
  expect(wrong?.includes("not on the card"), `refusal: ${wrong}`);
  const right = run("studio:act", { projectId, messageId: card._id, action: { type: "chooseConcept", id: "a" } }, person);
  const after = run("messages:list", { projectId }, person).find((message) => message.kind === "conceptSet");
  expect(right.waitingOnGala === true && after.artifact.chosenId === "a", "the choice was not recorded");
});

check("an action for a step the project is not on is refused", () => {
  const card = run("messages:list", { projectId }, person).find((message) => message.kind === "conceptSet");
  const message = refusal("studio:act", { projectId, messageId: card._id, action: { type: "saveColors", primary: "#B83A1B", secondary: "#E3B65C", tertiary: null } }, person);
  expect(message !== null, "saving colors on a concept card was accepted");
});

check("closing the turn releases the lock and clears the waiting flag", () => {
  const closed = run("engine:end", inTurn("turn-1"));
  const project = run("projects:get", { projectId }, person);
  expect(closed.released === true && project.working === null && project.turnStartedAt === null && project.waitingOnGala === false, JSON.stringify(project));
});

check("picks: only a draft on the card can go to the halls, and its quote waits for the check", () => {
  run("engine:begin", opening("turn-4"));
  run(
    "engine:write",
    inTurn("turn-4", {
      operations: [
        { op: "artifact", kind: "picks", artifact: { say: "One last thing, and it’s optional.", drafts: [{ id: "a", markFileId: fileId }], finalMarkFileId: fileId, answered: null } },
        { op: "project", stage: "picks" },
      ],
    }),
  );
  run("engine:end", inTurn("turn-4"));
  const card = run("messages:list", { projectId }, person).find((message) => message.kind === "picks");
  const forged = refusal("studio:act", { projectId, messageId: card._id, action: { type: "submitPicks", hated: { draftId: "never-drawn", quote: "x" }, loved: null } }, person);
  expect(forged?.includes("not on the card"), `refusal: ${forged}`);
  run("studio:act", { projectId, messageId: card._id, action: { type: "submitPicks", hated: { draftId: "a", quote: "It looked like a sad potato." }, loved: { quote: "" } } }, person);
  const opened = run("engine:begin", opening("turn-5"));
  expect(opened.quotesToCheck.length === 1 && opened.quotesToCheck[0].hall === "shame", JSON.stringify(opened.quotesToCheck));
});

check("the halls stay quiet: the public list shows none of it before launch", () => {
  const shown = [...run("halls:list", { hall: "shame" }), ...run("halls:list", { hall: "fame" })];
  expect(!shown.some((entry) => entry.brandName === "Ember & Rye" && entry.quote === "It looked like a sad potato."), "an unchecked pick is public");
});

check("a quote that fails its check is dropped, and nothing is left to check", () => {
  const opened = run("engine:begin", opening("turn-5"));
  run("engine:write", inTurn("turn-5", { operations: [{ op: "quoteChecked", submissionId: opened.quotesToCheck[0].id, passed: false }] }));
  const after = run("engine:read", inTurn("turn-5"));
  run("engine:end", inTurn("turn-5"));
  expect(after.quotesToCheck.length === 0, "the quote is still waiting");
});

check("the prompt function joins the stored values (length only; the text is never printed)", () => {
  const prompt = run("prompt:read");
  expect(typeof prompt === "string" && prompt.length > 1000 && prompt.startsWith("@@ persona"), "no prompt, or not the stored one");
});

class NotRun extends Error {}

check("a turn's id stops working when its lock runs out", async () => {
  if (!process.argv.includes("--aged-lock")) throw new NotRun("it waits out the lock's 12 minutes; run with --aged-lock");
  const aged = run("projects:create", {}, person);
  run("engine:begin", { subject: person.subject, projectId: aged, turnId: "aged-turn" });
  expect(run("engine:holds", { projectId: aged, turnId: "aged-turn" }) === true, "the fresh lock does not hold");
  const lifetime = run("projects:get", { projectId: aged }, person).turnLifetimeMs;
  await new Promise((resolve) => setTimeout(resolve, lifetime + 15_000));
  const message = refusal("engine:write", { projectId: aged, turnId: "aged-turn", operations: [{ op: "say", text: "Too late." }] });
  expect(message?.includes("This turn is over.") && run("engine:holds", { projectId: aged, turnId: "aged-turn" }) === false, `refusal: ${message}`);
  expect(run("engine:end", { projectId: aged, turnId: "aged-turn" }).released === true, "an aged turn could not close");
});

let passed = 0;
let failed = 0;
let notRun = 0;
console.log(`Storage check: ${checks.length} checks`);
for (const { name, fn } of checks) {
  try {
    await fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (error) {
    if (error instanceof NotRun) {
      notRun++;
      console.log(`  skip  ${name}: not run (${error.message})`);
    } else {
      failed++;
      console.log(`  FAIL  ${name}: ${error.message}`);
    }
  }
}
console.log(notRun > 0 || passed + failed !== checks.length ? `${passed}/${checks.length}, run incomplete (${failed} failed, ${notRun} not run)` : `${passed}/${checks.length} passed`);
process.exit(passed === checks.length ? 0 : 1);
