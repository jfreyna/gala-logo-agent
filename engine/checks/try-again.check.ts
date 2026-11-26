/**
 * Try again replays the request it failed on (FRI-1729, walk note 21).
 *
 *   node --env-file-if-exists=/home/sprite/gala.env engine/checks/try-again.check.ts
 *
 * Storage is memory. The first checks ask no model and run anywhere; the
 * last three replay the founder's case through real turns, so they read the
 * person's words with the real Jev and models and run only on the Sprite
 * (anywhere else they are reported as not run, and the run is incomplete).
 * A model failure is injected as the walk had it: a ModelError on the
 * turn's first write.
 *
 * What this proves:
 *   - on a Try again turn, a notice that offers Try again is not an answer:
 *     the request before it, and an image attached with it, are still owed,
 *     through any number of such notices in a row; on any other turn it is
 *     an answer, so a Back press to the brief after a failure reads nothing;
 *   - a new message from the person after the notice is read alone, and a
 *     real answer after it closes the request;
 *   - Stopped with something kept, Repeated and a typeface that can't draw
 *     the name are answers;
 *   - Stopped with nothing kept offers Try again (the founder's addition):
 *     the stopped request stays owed for it, and a new message after it is
 *     read alone; with something kept there is no button and Try again
 *     replays nothing;
 *   - a Try again with nothing owed writes one line, never silence; a turn
 *     that is not a Try again writes no such line;
 *   - the founder's case: "Lockup is approved as shown.", a model failure,
 *     then Try again: the approval is read and saved once, and a second Try
 *     again finds nothing owed; a failure then a new typed message saves the
 *     approval once, never twice;
 *   - a typeface notice (font or color) stays an answer: Try again after it
 *     replays nothing, and a new pick after it is read alone;
 *   - through real turns: a stop with nothing kept, a Try again stopped
 *     again (Stopped again, never Repeated), then Try again: saved once;
 *   - Repeated still follows the same failure twice (FRI-1714).
 *
 * What it does not prove: what the page draws, or that the button sends the
 * retry marker (read in src/pages/Studio.tsx and engine/api.ts). Each model
 * reading is one reading, so a pass is evidence, not a guarantee.
 */
import { assert, assertEqual, createHarness, NotRun } from "../../kit/scripts/harness.ts";
import { CannotSet } from "../../kit/src/font.ts";
import { ModelError } from "../gemini.ts";
import { runTurn } from "../loop.ts";
import { brief } from "../stages/brief.ts";
import { NOTICE_KIND, noticeFor, nothingOwedLine, stoppedNotice, type Notice } from "../notice.ts";
import { assertComplete, loadPrompt, type Prompt } from "../prompt.ts";
import { MemoryStore } from "../store-memory.ts";
import type { Operation } from "../store.ts";
import { Turn } from "../turn.ts";
import { projectAt } from "./project.ts";

const h = createHarness("Try again replays the request it failed on (FRI-1729)");

const APPROVAL = "Lockup is approved as shown.";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

/** A storage that fails the next write that isn't a notice, the way a model out of reach failed the walk's turn. */
class FailingStore extends MemoryStore {
  failNext = false;
  /** Every write, for counting what was saved. */
  log: Operation[] = [];
  override async write(operations: Operation[]): Promise<void> {
    const notice = operations.some((item) => item.op === "artifact" && item.kind === NOTICE_KIND);
    if (this.failNext && !notice) {
      this.failNext = false;
      throw new ModelError("gemini-4-neon did not answer (TimeoutError)");
    }
    this.log.push(...structuredClone(operations));
    return super.write(operations);
  }
}

function gala(store: MemoryStore, kind: string, artifact: Record<string, unknown> | null, text: string | null = null): void {
  store.messages.push({ id: `gala-${store.messages.length}`, author: "gala", kind, text, artifact, upload: null });
}

const modelNotice = (stage = "lockup") => noticeFor(new ModelError("x"), stage as never, "Ember & Rye", null);

/** What a turn reads as owed: a Try again turn unless `retry` is false. */
async function unanswered(store: MemoryStore, retry = true): Promise<string[]> {
  const turn = new Turn(store, {} as never, new AbortController().signal);
  turn.retrying = retry;
  await turn.read();
  return turn.unanswered().map((message) => message.text ?? "");
}

/** How many times the lockup was saved as approved: its choice, written once per approval. */
const approvals = (store: FailingStore) => store.log.filter((item) => item.op === "choice" && item.step === "lockup").length;

let prompt: Prompt | null = null;
async function realPrompt(): Promise<Prompt> {
  if ((process.env.GALA_TYPESAFE_URL ?? "") === "") throw new NotRun("needs Jev and the models (run it on the Sprite)");
  if (prompt === null) {
    prompt = await loadPrompt();
    assertComplete(prompt);
  }
  return prompt;
}

h.check("a request, then a notice that offers Try again: the request is still owed", async () => {
  const store = projectAt("lockup");
  store.visitorSays(APPROVAL);
  gala(store, NOTICE_KIND, modelNotice());
  assertEqual(await unanswered(store), [APPROVAL], "what is owed");
});

h.check("an image attached before the failure is still owed with it", async () => {
  const store = projectAt("lockup");
  store.visitorSays("Like this storefront", { bytes: PNG, contentType: "image/png", fileName: "storefront.png" });
  gala(store, NOTICE_KIND, modelNotice());
  const turn = new Turn(store, {} as never, new AbortController().signal);
  turn.retrying = true;
  await turn.read();
  assertEqual((await turn.attachedImages()).length, 1, "images owed");
});

h.check("only a Try again turn replays: any other turn reads the notice as an answer, and a Back press to the brief reads nothing", async () => {
  const store = projectAt("lockup");
  store.visitorSays(APPROVAL);
  gala(store, NOTICE_KIND, modelNotice());
  assertEqual(await unanswered(store, false), [], "what a turn that isn't a Try again reads");
  // The brief step as a Back press leaves it: the stage moved, the step about to read what is owed.
  store.project.stage = "brief";
  const turn = new Turn(store, {} as never, new AbortController().signal);
  await turn.read();
  // With anything owed the brief would ask the model, which throws on the empty prompt: "wait" means it read nothing.
  assertEqual(await brief(turn), "wait", "the brief step");
});

h.check("two failures in a row with different causes: the request is still owed", async () => {
  const store = projectAt("lockup");
  store.visitorSays(APPROVAL);
  gala(store, NOTICE_KIND, noticeFor(new Error("boom"), "lockup", "Ember & Rye", null));
  gala(store, NOTICE_KIND, modelNotice());
  assertEqual(await unanswered(store), [APPROVAL], "what is owed");
});

h.check("a new message after the notice is read alone; a real answer after it closes the request", async () => {
  const store = projectAt("lockup");
  store.visitorSays(APPROVAL);
  gala(store, NOTICE_KIND, modelNotice());
  store.visitorSays("Use this lockup");
  assertEqual(await unanswered(store), ["Use this lockup"], "after a new message");
  gala(store, "text", null, "Color is next.");
  assertEqual(await unanswered(store), [], "after a real answer");
});

h.check("Stopped with something kept, Repeated and a typeface that can't draw the name are answers", async () => {
  const font = new CannotSet("Alata", "missingLetters", "no letters", ["&"]);
  const first = noticeFor(new ModelError("x"), "lockup", "Ember & Rye", null);
  const repeated = noticeFor(new ModelError("x"), "lockup", "Ember & Rye", { id: "n", author: "gala", kind: NOTICE_KIND, text: null, artifact: first as never, upload: null });
  const cases: [string, Notice][] = [
    ["Stopped with something kept", stoppedNotice("lockup", true)],
    ["Repeated", repeated],
    ["a typeface that can't draw the name", noticeFor(font, "wordmark", "Ember & Rye", null)],
  ];
  for (const [name, notice] of cases) {
    const store = projectAt("lockup");
    store.visitorSays(APPROVAL);
    gala(store, NOTICE_KIND, notice);
    assertEqual(await unanswered(store), [], name);
  }
  assertEqual(repeated.kind, "repeated", "the same failure twice is still Repeated");
});

h.check("Stop with nothing kept: the notice offers Try again, the request stays owed for it, and a new message supersedes it", async () => {
  const store = projectAt("lockup");
  store.visitorSays(APPROVAL);
  // Stopped before steering read anything: nothing was kept.
  const stop = new AbortController();
  stop.abort();
  assertEqual(await runTurn(store, {} as never, stop.signal), "stopped", "the stopped turn");
  const notice = store.latest(NOTICE_KIND).artifact as Notice;
  assertEqual([notice.kind, notice.say, notice.actions], ["stopped", "Stopped. Nothing from that turn was kept. Try again, or tell me what to do next.", [{ label: "Try again", do: "retry" }]], "the notice");
  assert(!/—/.test(notice.say), "the line carries a dash");
  assertEqual(await unanswered(store), [APPROVAL], "what Try again would replay");
  store.visitorSays("Make the gap bigger");
  assertEqual(await unanswered(store), ["Make the gap bigger"], "what a new message's turn reads");
});

h.check("Stop with something kept: no button, and Try again replays nothing, with one line", async () => {
  const store = projectAt("lockup");
  store.visitorSays(APPROVAL);
  gala(store, "text", null, "Here is the lockup again.");
  gala(store, NOTICE_KIND, stoppedNotice("lockup", true));
  assertEqual((store.latest(NOTICE_KIND).artifact as Notice).actions, [], "the notice's buttons");
  const before = store.messages.length;
  // A model read here would throw on the empty prompt and write a notice: the line proves nothing was read.
  assertEqual(await runTurn(store, {} as never, new AbortController().signal, { retry: true }), "done", "the retry");
  assertEqual(store.messages.slice(before).map((message) => [message.author, message.kind, message.text]), [["gala", "text", nothingOwedLine("lockup")]], "what the retry wrote");
  assert(store.latest("lockup").artifact!.approved !== true, "the stopped approval was replayed");
  assert(!/—/.test(nothingOwedLine("lockup")), "the line carries a dash");
});

h.check("Try again after a real answer: one line, never silence; a turn that isn't a Try again adds no line", async () => {
  const store = projectAt("lockup");
  store.visitorSays(APPROVAL);
  gala(store, NOTICE_KIND, modelNotice());
  gala(store, "text", null, "Tell me what to change, or approve the lockup.");
  const before = store.messages.length;
  assertEqual(await runTurn(store, {} as never, new AbortController().signal), "done", "a plain turn");
  assertEqual(store.messages.length, before, "a plain turn wrote something");
  assertEqual(await runTurn(store, {} as never, new AbortController().signal, { retry: true }), "done", "the retry");
  assertEqual(
    store.messages.slice(before).map((message) => message.text),
    [nothingOwedLine("lockup")],
    "what the retry wrote",
  );
});

h.check("a typeface notice is an answer: Try again after it replays nothing, and a new pick after a color notice is read alone", async () => {
  const font = noticeFor(new CannotSet("Alata", "missingLetters", "no letters", ["&"]), "lockup", "Ember & Rye", null);
  assert(!font.actions.some((action) => action.do === "retry"), "the typeface notice offers Try again");
  const store = projectAt("lockup");
  store.visitorSays("Set the name in Alata");
  gala(store, NOTICE_KIND, font);
  const before = store.messages.length;
  // A model read of "Set the name in Alata" would throw on the empty prompt and write a notice instead of the line.
  assertEqual(await runTurn(store, {} as never, new AbortController().signal, { retry: true }), "done", "Try again after the typeface notice");
  assertEqual(store.messages.slice(before).map((message) => [message.kind, message.text]), [["text", nothingOwedLine("lockup")]], "what the retry wrote");

  const color = noticeFor(new CannotSet("Noto Color Emoji", "color", "color"), "type", "Ember & Rye", null);
  const picked = projectAt("type");
  picked.visitorSays("Use Noto Color Emoji");
  gala(picked, NOTICE_KIND, color);
  picked.visitorSays("Use Bitter");
  assertEqual(await unanswered(picked), ["Use Bitter"], "what the new pick's turn reads");
});

h.check("the walk: approval, a model failure, Try again: saved once; a second Try again finds nothing owed", async () => {
  const real = await realPrompt();
  const store = new FailingStore();
  Object.assign(store, projectAt("lockup"));
  store.visitorSays(APPROVAL);
  store.failNext = true;
  assertEqual(await runTurn(store, real, new AbortController().signal), "trouble", "the failed turn");
  const notice = store.latest(NOTICE_KIND).artifact as Notice;
  assertEqual([notice.kind, notice.cause, notice.actions.map((action) => action.do)], ["couldnt", "model", ["retry"]], "the notice");
  assertEqual([approvals(store), store.project.stage], [0, "lockup"], "after the failure");

  assertEqual(await runTurn(store, real, new AbortController().signal, { retry: true }), "done", "Try again");
  assertEqual(store.latest("lockup").artifact!.approved, true, "the lockup card");
  assert(store.project.stage !== "lockup", `the stage stayed at ${store.project.stage}`);
  assertEqual(approvals(store), 1, "approvals after Try again");

  const stage = store.project.stage;
  const before = store.messages.length;
  assertEqual(await runTurn(store, real, new AbortController().signal, { retry: true }), "done", "a second Try again");
  assertEqual(store.messages.slice(before).map((message) => message.text), [nothingOwedLine(stage)], "what the second Try again wrote");
  assertEqual([approvals(store), store.project.stage], [1, stage], "after the second Try again");
});

h.check("stop with nothing kept, Try again stopped again (Stopped again, not Repeated), then Try again: saved once", async () => {
  const real = await realPrompt();
  const store = new FailingStore();
  Object.assign(store, projectAt("lockup"));
  store.visitorSays(APPROVAL);
  for (const attempt of ["the stopped turn", "the stopped Try again"]) {
    const stop = new AbortController();
    stop.abort();
    assertEqual(await runTurn(store, real, stop.signal, attempt === "the stopped turn" ? {} : { retry: true }), "stopped", attempt);
    const notice = store.latest(NOTICE_KIND).artifact as Notice;
    assertEqual([notice.kind, notice.actions.map((action) => action.do)], ["stopped", ["retry"]], `the notice after ${attempt}`);
  }
  assertEqual(store.messages.filter((message) => message.kind === NOTICE_KIND && (message.artifact as Notice).kind === "repeated").length, 0, "Repeated notices");
  assertEqual(approvals(store), 0, "approvals before Try again");
  assertEqual(await runTurn(store, real, new AbortController().signal, { retry: true }), "done", "Try again");
  assertEqual([store.latest("lockup").artifact!.approved, approvals(store)], [true, 1], "the card and the approvals");
  assert(store.project.stage !== "lockup", `the stage stayed at ${store.project.stage}`);
});

h.check("the walk's way through: approval, a model failure, then \"Use this lockup\" typed: saved once, never twice", async () => {
  const real = await realPrompt();
  const store = new FailingStore();
  Object.assign(store, projectAt("lockup"));
  store.visitorSays(APPROVAL);
  store.failNext = true;
  assertEqual(await runTurn(store, real, new AbortController().signal), "trouble", "the failed turn");
  store.visitorSays("Use this lockup");
  assertEqual(await unanswered(store), ["Use this lockup"], "what the next turn reads");
  assertEqual(await runTurn(store, real, new AbortController().signal), "done", "the typed turn");
  assertEqual([store.latest("lockup").artifact!.approved, approvals(store)], [true, 1], "the card and the approvals");
  const before = store.messages.length;
  assertEqual(await runTurn(store, real, new AbortController().signal, { retry: true }), "done", "a stale Try again");
  assertEqual([approvals(store), store.messages.slice(before).length], [1, 1], "approvals and lines after the stale Try again");
});

await h.run();
