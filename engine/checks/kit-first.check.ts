/**
 * The kit card first, the halls card after the first download (FRI-1723),
 * without a model.
 *
 *   node --experimental-strip-types --no-warnings engine/checks/kit-first.check.ts
 *
 * Storage is memory. The model's words are stubbed: the kit step falls
 * back to its fixed line, and an answer to a message is a stand-in line.
 * The kit itself is built for real (a logo of the name alone, so no mark
 * file is needed), which fetches the typeface from Google Fonts.
 *
 * What this proves: the kit step writes the kit card alone, marked not
 * downloaded and carrying the logo the halls will offer, and leaves the
 * project at the picks step; a wake with no download and no message writes
 * nothing; the first download's wake writes the "files saved" line on one
 * halls card, with every draft and the kit's logo; a second wake (a second
 * download, a reload) adds nothing; someone who never downloads gets the
 * halls card right after Gala's answer to their next message; a message
 * once the card is there gets an answer and no second card.
 *
 * What it does not prove: that the page sends the action once, or that
 * `act` records only the first download and wakes Gala (those run on
 * Convex: the preview walk and the screenshots in the PR); what Gala's
 * real answer says; how the cards look.
 */
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { FILES_SAVED_LINE, KIT_LINE, NAME_ONLY_KIT_LINE, PICKS_LINE } from "../lines.ts";
import { kit, picks } from "../stages/kit.ts";
import type { MemoryStore } from "../store-memory.ts";
import type { Stage } from "../store.ts";
import { Turn, type Steering } from "../turn.ts";
import { projectAt } from "./project.ts";

/** Stands in for Gala's answer to a message. */
const ANSWER = "(Gala answers the message)";

/** A turn on `store` with no model: the model's words are refused, and an answer is the stand-in line. */
async function turnOn(store: MemoryStore, next: Steering | null = null): Promise<Turn> {
  const turn = new Turn(store, {} as never, new AbortController().signal);
  assert(await turn.read(), "the turn could not open");
  turn.think = (async () => ({ say: "", lines: [] })) as Turn["think"];
  turn.mayShow = async () => false;
  turn.answer = async () => turn.write([{ op: "say", text: ANSWER }]);
  turn.steer(next);
  return turn;
}

/** The project at its colorways step with a colorway chosen, for a logo of the name alone. */
function readyForKit(): MemoryStore {
  const store = projectAt("lockup");
  store.project.stage = "kit" as Stage;
  const opener = store.messages.find((message) => message.kind === "symbolOpener")!;
  opener.artifact = { ...opener.artifact, answered: "noSymbol" };
  const colors = { primary: "#B83A1B", secondary: "#E3B65C", tertiary: null };
  store.messages.push({ id: "card-colorPicker", author: "gala", kind: "colorPicker", text: null, artifact: { say: "Pick your colors.", colors, saved: true }, upload: null });
  store.messages.push({
    id: "card-colorwaySet",
    author: "gala",
    kind: "colorwaySet",
    text: null,
    artifact: {
      say: "Three colorways.",
      colors,
      colorways: [{ id: "cw-a", letter: "A", name: "Ember", rationale: "", assignment: { mark: "primary", wordmark: "primary", ground: "white" } }],
      chosenId: "cw-a",
    },
    upload: null,
  });
  return store;
}

/** The project at the picks step just after the kit step, with no halls card yet. */
function afterKit(downloaded: boolean): MemoryStore {
  const store = projectAt("lockup");
  store.project.stage = "picks" as Stage;
  store.messages.push({ id: "card-kit", author: "gala", kind: "kit", text: null, artifact: { say: KIT_LINE, lockups: [], formats: [], hallsMarkFileId: "file-logo", downloaded }, upload: null });
  return store;
}

const halls = (store: MemoryStore) => store.messages.filter((message) => message.kind === "picks");
const talk: Steering = { act: "talk" };

/** The drafts Gala showed in the made-up project: three directions and three variations. */
const SHOWN = ["mark-a", "mark-b", "mark-c", "var-1", "var-2", "var-3"];

const h = createHarness("Kit first, halls after the first download (FRI-1723)");

h.check("the kit step writes the kit card alone, not downloaded, with the halls logo, and waits at the picks step", async () => {
  const store = readyForKit();
  assertEqual(await kit(await turnOn(store)), "wait", "the kit step's outcome");
  const card = store.latest("kit").artifact!;
  assertEqual(halls(store).length, 0, "halls cards after the kit step");
  assertEqual(store.project.stage, "picks", "the stage after the kit");
  assertEqual(card.say, NAME_ONLY_KIT_LINE, "the kit card's line (the fixed one, with no model)");
  assertEqual(card.downloaded, false, "the kit card's download mark");
  assert(typeof card.hallsMarkFileId === "string" && card.hallsMarkFileId !== "", "the kit card carries no logo for the halls");
  assert(store.kit !== null && store.kit.files.length > 0, "no kit was stored");
});

h.check("a wake with no download and no message writes nothing", async () => {
  const store = afterKit(false);
  const before = store.messages.length;
  assertEqual(await picks(await turnOn(store)), "wait", "the outcome");
  assertEqual(store.messages.length, before, "messages written");
});

h.check("the first download's wake writes the files-saved line on one halls card, with every draft and the kit's logo", async () => {
  const store = afterKit(true);
  await picks(await turnOn(store));
  const cards = halls(store);
  assertEqual(cards.length, 1, "halls cards");
  const card = cards[0]!.artifact!;
  assertEqual(card.say, FILES_SAVED_LINE, "the halls card's line");
  assertEqual(card.drafts.map((draft: { id: string }) => draft.id), SHOWN, "the drafts on the halls card");
  assertEqual(card.finalMarkFileId, "file-logo", "the logo for the Hall of fame");
  assertEqual(card.answered, null, "answered");
  assertEqual(store.messages.at(-1)!.kind, "picks", "the last message");
});

h.check("a second download's wake, or a reload, adds no second halls card", async () => {
  const store = afterKit(true);
  await picks(await turnOn(store));
  const before = store.messages.length;
  await picks(await turnOn(store));
  await picks(await turnOn(store));
  assertEqual(halls(store).length, 1, "halls cards");
  assertEqual(store.messages.length, before, "messages written by the later wakes");
});

h.check("someone who never downloads gets the halls card right after Gala answers their next message", async () => {
  const store = afterKit(false);
  store.visitorSays("Thanks, this looks great.");
  await picks(await turnOn(store, talk));
  const last = store.messages.slice(-2);
  assertEqual(last.map((message) => message.text ?? message.kind), [ANSWER, "picks"], "the answer, then the halls card");
  assertEqual(last[1]!.artifact!.say, PICKS_LINE, "the halls card's line with no download");
  assertEqual(halls(store).length, 1, "halls cards");
});

h.check("a message with the download already marked gets the answer, then the files-saved halls card", async () => {
  const store = afterKit(true);
  store.visitorSays("Got them.");
  await picks(await turnOn(store, talk));
  const last = store.messages.slice(-2);
  assertEqual(last.map((message) => message.text ?? message.kind), [ANSWER, "picks"], "the answer, then the halls card");
  assertEqual(last[1]!.artifact!.say, FILES_SAVED_LINE, "the halls card's line");
});

h.check("a message once the halls card is there gets an answer and no second card", async () => {
  const store = afterKit(true);
  await picks(await turnOn(store));
  store.visitorSays("What happens to my picks?");
  await picks(await turnOn(store, talk));
  assertEqual(halls(store).length, 1, "halls cards");
  assertEqual(store.messages.at(-1)!.text, ANSWER, "the last message");
});

h.check("going back to the kit makes a new kit card; the old halls card is history and the new kit waits for its own download", async () => {
  const store = afterKit(true);
  await picks(await turnOn(store));
  store.messages.push({ id: "card-kit-2", author: "gala", kind: "kit", text: null, artifact: { say: KIT_LINE, lockups: [], formats: [], hallsMarkFileId: "file-logo-2", downloaded: false }, upload: null });
  await picks(await turnOn(store));
  assertEqual(halls(store).length, 1, "halls cards before the new kit's download");
  store.latest("kit").artifact!.downloaded = true;
  await picks(await turnOn(store));
  assertEqual(halls(store).length, 2, "halls cards after the new kit's download");
  assertEqual(store.latest("picks").artifact!.finalMarkFileId, "file-logo-2", "the new halls card's logo");
});

await h.run();
