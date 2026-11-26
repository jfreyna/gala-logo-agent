/**
 * Cards and history (FRI-1713): the rules, without a browser or a model.
 *
 *   node --experimental-strip-types --no-warnings engine/checks/cards.check.ts
 *
 * What this proves:
 *   - the studio's step order (src/studio/history.ts) is the engine's
 *     (engine/steps.ts), so "past" means the same on both sides;
 *   - which cards are read-only, signed off or behind, and where "Back to
 *     this step" goes, for each case the frames draw and the ones they
 *     imply (a card from a later step after going back gets no link);
 *   - every card action's line names the action and its object, and the
 *     chips leave none;
 *   - an action's line in the conversation is never read as something the
 *     person said, so steering does not answer a button press twice;
 *   - the wordmark card names the weight by its usual name.
 *
 * What it does not prove: what the page draws (scripts/check-cards.mjs),
 * that `act` stores the line on the real deployment, or the turn that
 * follows (scripts/check-feedback-walk.mjs).
 */
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { echoFor, ECHO_KIND } from "../../convex/lib/echo.ts";
import { isSignedOff, pastCards, STEP_ORDER } from "../../src/studio/history.ts";
import { weightName } from "../../src/studio/weights.ts";
import { STEPS } from "../steps.ts";
import { MemoryStore } from "../store-memory.ts";
import { Turn } from "../turn.ts";

const h = createHarness("Cards and history (FRI-1713)");

type M = { id: string; author: string; kind: string; artifact: Record<string, any> | null };
const gala = (id: string, kind: string, artifact: Record<string, any>): M => ({ id, author: "gala", kind, artifact });
const said = (id: string): M => ({ id, author: "visitor", kind: "text", artifact: null });

h.check("the studio's step order is the engine's: same stages, same card kinds, same returns", () => {
  assertEqual(
    STEP_ORDER.map((step) => [step.stage, step.kinds.join(","), step.canReturn]),
    STEPS.map((step) => [step.stage, step.kinds.join(","), step.canReturn]),
    "the step order",
  );
});

/** Each case: the conversation, the stage, and what each card's footer should be (absent: live). */
const CASES: { name: string; stage: Parameters<typeof pastCards>[1]; messages: M[]; expect: Record<string, { signedOff: boolean; backTo: string | null } | undefined> }[] = [
  {
    name: "the current step's card, not signed off, is live",
    stage: "wordmark",
    messages: [gala("wm", "wordmark", { approved: false })],
    expect: { wm: undefined },
  },
  {
    name: "a signed-off card at the current step is read-only, Signed off, with no way back to the step it is on",
    stage: "wordmark",
    messages: [gala("wm", "wordmark", { approved: true })],
    expect: { wm: { signedOff: true, backTo: null } },
  },
  {
    name: "cards of earlier steps are read-only and go back to their own step (the History cards frame)",
    stage: "wordmark",
    messages: [gala("dir", "direction", { approved: true }), gala("type", "typeSet", { saved: true, chosenId: "a" }), gala("wm", "wordmark", { approved: false })],
    expect: { dir: { signedOff: true, backTo: "research" }, type: { signedOff: true, backTo: "type" }, wm: undefined },
  },
  {
    name: "the brief, once behind the project, is This step is behind you (it has no sign-off of its own)",
    stage: "research",
    messages: [gala("brief", "brief", { brand: "Ember & Rye" }), gala("dir", "direction", { approved: false })],
    expect: { brief: { signedOff: false, backTo: "brief" }, dir: undefined },
  },
  {
    name: "after going back from the lockup, the later cards are behind, with no link (the engine cannot go forward)",
    stage: "directions",
    messages: [
      gala("c1", "conceptSet", { chosenId: "x" }),
      gala("v1", "variationSet", { chosenId: "y" }),
      gala("lk", "lockup", { approved: false }),
      said("back"),
      gala("c2", "conceptSet", { chosenId: null }),
    ],
    expect: { c1: { signedOff: true, backTo: null }, v1: { signedOff: true, backTo: null }, lk: { signedOff: false, backTo: null }, c2: undefined },
  },
  {
    name: "a type card superseded by going back is behind; the new one at the same step is live",
    stage: "type",
    messages: [gala("t1", "typeSet", { saved: true, chosenId: "a" }), gala("wm", "wordmark", { approved: false }), gala("t2", "typeSet", { saved: false, chosenId: null })],
    expect: { t1: { signedOff: true, backTo: null }, wm: { signedOff: false, backTo: null }, t2: undefined },
  },
  {
    name: "saved colors at the colorways step go back to picking colors",
    stage: "colorways",
    messages: [gala("cp", "colorPicker", { saved: true, colors: { primary: "#B83A1B", secondary: "#E3B65C", tertiary: null } }), gala("cw", "colorwaySet", { chosenId: null })],
    expect: { cp: { signedOff: true, backTo: "pickColors" }, cw: undefined },
  },
  {
    name: "cards with no buttons (research, kit) never get a footer",
    stage: "picks",
    messages: [gala("r", "research", {}), gala("k", "kit", {})],
    expect: { r: undefined, k: undefined },
  },
  {
    // FRI-1722 gave the stress test Approve and Change something, so once past it shows the footer like every card with buttons.
    name: "the stress test, now with buttons, shows the footer once past: signed off when approved",
    stage: "lockup",
    messages: [gala("s", "stressTest", { approved: true })],
    expect: { s: { signedOff: true, backTo: "stressTest" } },
  },
];

for (const entry of CASES) {
  h.check(entry.name, () => {
    const past = pastCards(entry.messages, entry.stage);
    for (const [id, expected] of Object.entries(entry.expect)) assertEqual(past[id] ?? undefined, expected, `card ${id}`);
  });
}

h.check("signed off means the card's own approval, for each kind that has one", () => {
  const table: [string, Record<string, unknown>, boolean][] = [
    ["direction", { approved: true }, true],
    ["direction", {}, false],
    ["typeSet", { saved: true, chosenId: "a" }, true],
    ["typeSet", { saved: false, chosenId: "a" }, false],
    ["wordmark", { approved: true }, true],
    ["lockup", { approved: false }, false],
    ["conceptSet", { chosenId: "x" }, true],
    ["variationSet", { chosenId: null }, false],
    ["colorPicker", { saved: true, colors: {} }, true],
    ["colorwaySet", { chosenId: "c" }, true],
    ["brief", { brand: "x" }, false],
  ];
  for (const [kind, artifact, expected] of table) assertEqual(isSignedOff(kind, artifact), expected, `${kind} ${JSON.stringify(artifact)}`);
});

/** Each card action, the card it was done on, and its two lines; null for an action that leaves none. */
const ECHOES: [string, Record<string, unknown>, Record<string, unknown> | null, [string, string] | null][] = [
  ["Looks right", { type: "approveDirection" }, {}, ["Direction looks right", "Direction looks right"]],
  ["Choose on a typeface", { type: "chooseType", id: "b" }, { directions: [{ id: "a", family: "Young Serif" }, { id: "b", family: "Alata" }] }, ["Picking Alata", "Picked Alata"]],
  ["Use for A in the type tray", { type: "useFamily", id: "a", family: "Buda" }, {}, ["Swapping in Buda", "Swapped in Buda"]],
  ["Use this wordmark", { type: "approveWordmark" }, {}, ["Using this wordmark", "Used this wordmark"]],
  ["Use this lockup", { type: "approveLockup" }, {}, ["Using this lockup", "Used this lockup"]],
  ["Choose on a direction", { type: "chooseConcept", id: "x" }, { concepts: [{ id: "x", letter: "A", name: "Hearth" }] }, ["Picking Hearth", "Picked Hearth"]],
  ["Choose on a variation with no name", { type: "chooseVariation", id: "y" }, { concepts: [{ id: "y", letter: "B", name: "" }] }, ["Picking variation B", "Picked variation B"]],
  ["Save colors", { type: "saveColors" }, {}, ["Saving your colors", "Saved your colors"]],
  ["Choose on a colorway", { type: "chooseColorway", id: "c" }, { colorways: [{ id: "c", letter: "C", name: "Ember on cream" }] }, ["Picking Ember on cream", "Picked Ember on cream"]],
  ["Send picks", { type: "submitPicks", hated: null, loved: { quote: "" } }, {}, ["Sending your picks to the halls", "Sent your picks to the halls"]],
  ["No picks", { type: "declinePicks" }, {}, ["No picks for the halls", "No picks for the halls"]],
  ["a Case chip", { type: "setWordmark", case: "allCaps" }, {}, null],
  ["a Layout chip", { type: "setLockup", layout: "stacked" }, {}, null],
];

for (const [name, action, card, expected] of ECHOES) {
  h.check(`${name}: ${expected === null ? "leaves no line" : `"${expected[0]}", then "${expected[1]}"`}`, () => {
    const echo = echoFor(action as never, card);
    assertEqual(echo === null ? null : [echo.sending, echo.sent], expected, "the line");
  });
}

h.check("an action's line is not something the person said: steering reads nothing, and an image check finds no upload", async () => {
  const store = new MemoryStore();
  store.project.stage = "wordmark";
  store.messages.push({ id: "card", author: "gala", kind: "wordmark", text: null, artifact: { say: "Here it is.", approved: true }, upload: null });
  store.messages.push({ id: "echo", author: "visitor", kind: ECHO_KIND, text: null, artifact: { sending: "Using this wordmark", sent: "Used this wordmark", wakes: true }, upload: null });
  // Reading the conversation needs no prompt; nothing here asks a model.
  const turn = new Turn(store, {} as never, new AbortController().signal);
  assert(await turn.read(), "the turn did not open");
  assertEqual(turn.unansweredText(), "", "what steering would read");
  assertEqual((await turn.attachedImages()).length, 0, "attached images");
});

h.check("the weight's name, for every hundred and between them", () => {
  const table: [number, string][] = [
    [100, "Thin"],
    [200, "ExtraLight"],
    [300, "Light"],
    [400, "Regular"],
    [500, "Medium"],
    [600, "SemiBold"],
    [700, "Bold"],
    [800, "ExtraBold"],
    [900, "Black"],
    [320, "Light"],
    [480, "Medium"],
  ];
  for (const [weight, name] of table) assertEqual(weightName(weight), name, `weight ${weight}`);
});

await h.run();
