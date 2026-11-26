/**
 * The symbol opener. With the wordmark approved, Gala says the step, the
 * symbol, and asks what the person is picturing, with a few ideas from the
 * research and anything they asked for earlier. No drawing happens until
 * the person describes an idea or says go ahead.
 *
 * Steering reads the answer (steer.ts): an idea is kept on this card and
 * goes to every drawing; "go ahead" is this step's approval; and a clear,
 * explicit ask for no symbol is the only way to a logo of the name alone,
 * which skips the symbol steps and the lockup and goes on to color.
 */
import type { Shape } from "../gemini.ts";
import { SYMBOL_STEPS } from "../steps.ts";
import { asked, keptCard, requestsOf, type Outcome, type Request, type Turn } from "../turn.ts";
import { briefOf } from "./brief.ts";
import { openColors } from "./color.ts";
import { directionOf } from "./research.ts";

const OPENER: Shape = {
  type: "OBJECT",
  properties: {
    say: { type: "STRING", description: "What Gala says to open the symbol step" },
    ideas: { type: "ARRAY", items: { type: "STRING" }, description: "Two or three short ideas for what the symbol could show, each a few words, drawn from the brief and the research" },
  },
  required: ["say", "ideas"],
};

/** Gala opens the step. */
async function open(turn: Turn): Promise<Outcome> {
  const kept = turn.heldFor(...SYMBOL_STEPS);
  const wordsChecked = await turn.composeCard(
    () =>
      turn.think<{ say: string; ideas: string[] }>({
        section: "conversation",
        task: "The wordmark is approved, and this step is the symbol: a shape that stands on its own beside the name, with no letters in it. Say that the wordmark is approved and that the symbol comes now. If the person asked for something for the symbol earlier, say you kept it and name it. Offer two or three ideas to start from, and ask what they are picturing: one of those, something of their own, or go ahead and you will draw three. Draw nothing yet.",
        facts: { step: "symbol", brief: briefOf(turn), direction: directionOf(turn), research: turn.latest("research")?.artifact ?? null, whatThePersonAskedForEarlier: kept.length > 0 ? kept : null },
        shape: OPENER,
      }),
    (value) => ({ line: value.say, card: value.ideas }),
  );
  if (wordsChecked === null) {
    await turn.decline();
    return "wait";
  }
  const words = keptCard(wordsChecked, turn.stage);
  await turn.write([{ op: "artifact", kind: "symbolOpener", artifact: { say: words.say, ideas: words.ideas.slice(0, 3), answered: null } }]);
  return "wait";
}

/** The person answered: the idea, if any, stays on the card, and the drawing starts. */
async function proceed(turn: Turn, cardId: string, answered: "idea" | "goAhead", request: Request | null): Promise<Outcome> {
  const card = turn.state.messages.find((message) => message.id === cardId)!;
  const requests = [...((card.artifact!.requests as string[] | undefined) ?? []), ...(requestsOf(request).requests ?? []), ...(asked({ typeface: null, nameAs: null, drawing: null, note: request?.note ?? null }) ?? [])];
  await turn.write([
    { op: "patchArtifact", messageId: card.id, artifact: { ...card.artifact!, answered, ...(requests.length > 0 ? { requests: [...new Set(requests)] } : {}) } },
    { op: "choice", step: "symbolOpener", chosen: answered, discarded: [] },
    { op: "project", stage: "directions" },
  ]);
  return "continue";
}

export async function symbolOpener(turn: Turn): Promise<Outcome> {
  const next = turn.take();
  const card = turn.current("symbolOpener");
  if (card === null) return open(turn);

  // The person described what the symbol should show.
  if (next?.act === "redo") return proceed(turn, card.id, "idea", next.request);
  // "Go ahead", said or steered: this step's approval.
  if (card.artifact!.answered === "goAhead" || card.artifact!.answered === "idea") return proceed(turn, card.id, card.artifact!.answered, null);

  // A logo of the name alone, asked for explicitly: the symbol steps and the lockup are skipped, and color opens on the wordmark.
  if (next?.act === "noSymbol") {
    return openColors(turn, [
      { op: "patchArtifact", messageId: card.id, artifact: { ...card.artifact!, answered: "noSymbol" } },
      { op: "choice", step: "symbolOpener", chosen: "noSymbol", discarded: [] },
    ]);
  }

  if (next !== null) await turn.answer(next, "the person to describe what the symbol should show, or say go ahead");
  return "wait";
}
