/**
 * Which of Gala's lines carry reply buttons, and where each row stands
 * (gala-reply-buttons, FRI-1722). Read from the stored conversation only,
 * so a reload shows the same rows: a line that offered a move keeps its
 * buttons, Done once the move is answered.
 *
 *   - An offer (engine/steer.ts) is stored on the step's card with
 *     `afterMessages`, the length of the conversation when it was made. The
 *     line that made it is Gala's first words-only line from there.
 *     Standing: Default. Pressed and waiting for Gala: Working. Answered
 *     (the card's `answeredOffers`), or out of date because Gala has spoken
 *     since: Done.
 *   - A second dead end after the directions (engine/turn.ts `exitsFor`)
 *     stores `exits` on the step's card: "Finish in the kit" first when the
 *     kit can finish it, and "Back to directions"; that one alone otherwise
 *     (Second button off). Pressed: Working. Answered, or Gala has spoken
 *     since: Done. "Finish in the kit" moves nothing, so it never changes
 *     the row.
 *   - The symbol opener carries Go ahead alone. Done once it is answered
 *     (an idea, go ahead, or no symbol), or once the project has moved on.
 *
 * No imports, so the checks can read this file directly.
 */

export type ReplyView = { primary: string; secondary: string | null; state: "Default" | "Working" | "Done"; pressed: "primary" | "secondary" | null };
export type ReplyAction = { type: "answerOffer"; answer: "yes" | "no"; cardId: string } | { type: "goAhead" } | { type: "takeWayOut"; cardId: string } | { type: "finishInKit" };
export type LineReply = { view: ReplyView; primary: ReplyAction; secondary?: ReplyAction };

type Message = { id: string; author: string; kind: string; artifact: Record<string, any> | null };

/** The approved labels (FRI-1722). */
export const OFFER_LABELS = { yes: "Yes, redraw", no: "No" } as const;
export const GO_AHEAD = "Go ahead";
export const EXIT_LABELS = { kit: "Finish in the kit", directions: "Back to directions" } as const;

/** The index of Gala's first words-only line at or after `from`, or -1. */
function lineFrom(messages: Message[], from: number): number {
  for (let at = Math.max(0, from); at < messages.length; at++) {
    if (messages[at]!.author === "gala" && messages[at]!.kind === "text") return at;
  }
  return -1;
}

/**
 * The reply rows, keyed by the id of the message they sit under.
 * `pressedHere` is a press this page sent that the stored conversation
 * doesn't show yet, keyed the same way: it shows Working at once.
 * `openerStage` is true while the project is at the symbol opener.
 */
export function repliesFor(messages: Message[], pressedHere: Record<string, "primary" | "secondary">, openerStage: boolean): Record<string, LineReply> {
  const rows: Record<string, LineReply> = {};
  const offerRow = (cardId: string, line: number, state: ReplyView["state"], pressed: ReplyView["pressed"]) => {
    const id = messages[line]!.id;
    const here = pressedHere[id];
    const shown = state === "Default" && here !== undefined ? { state: "Working" as const, pressed: here } : { state, pressed };
    rows[id] = {
      view: { primary: OFFER_LABELS.yes, secondary: OFFER_LABELS.no, ...shown },
      primary: { type: "answerOffer", answer: "yes", cardId },
      secondary: { type: "answerOffer", answer: "no", cardId },
    };
  };

  messages.forEach((message) => {
    if (message.author !== "gala" || message.artifact === null) return;
    const answered = Array.isArray(message.artifact.answeredOffers) ? (message.artifact.answeredOffers as { afterMessages: number; answer: string }[]) : [];
    for (const entry of answered) {
      const line = lineFrom(messages, entry.afterMessages);
      if (line >= 0) offerRow(message.id, line, "Done", null);
    }
    const offer = message.artifact.offer as { afterMessages: number; pressed?: "yes" | "no" } | null | undefined;
    if (offer !== null && offer !== undefined && typeof offer.afterMessages === "number") {
      const line = lineFrom(messages, offer.afterMessages);
      if (line < 0) return;
      const spokenSince = messages.slice(line + 1).some((later) => later.author === "gala");
      if (spokenSince) offerRow(message.id, line, "Done", null);
      else if (offer.pressed !== undefined) offerRow(message.id, line, "Working", offer.pressed === "yes" ? "primary" : "secondary");
      else offerRow(message.id, line, "Default", null);
    }
    const exits = Array.isArray(message.artifact.exits) ? (message.artifact.exits as { afterMessages: number; kitCanFinish: boolean; pressed?: string; answered?: boolean }[]) : [];
    for (const entry of exits) {
      const line = lineFrom(messages, entry.afterMessages);
      if (line < 0) continue;
      const id = messages[line]!.id;
      const back = { type: "takeWayOut" as const, cardId: message.id };
      const spokenSince = messages.slice(line + 1).some((later) => later.author === "gala");
      const backAt = entry.kitCanFinish ? "secondary" : "primary";
      const here = pressedHere[id];
      const state: ReplyView["state"] = entry.answered === true || spokenSince ? "Done" : entry.pressed !== undefined ? "Working" : here === backAt ? "Working" : "Default";
      const pressed = state === "Working" ? backAt : null;
      rows[id] = entry.kitCanFinish
        ? { view: { primary: EXIT_LABELS.kit, secondary: EXIT_LABELS.directions, state, pressed }, primary: { type: "finishInKit" }, secondary: back }
        : { view: { primary: EXIT_LABELS.directions, secondary: null, state, pressed }, primary: back };
    }
    if (message.kind === "symbolOpener") {
      const done = (message.artifact.answered !== null && message.artifact.answered !== undefined) || !openerStage;
      const here = pressedHere[message.id];
      const view: ReplyView = done
        ? { primary: GO_AHEAD, secondary: null, state: "Done", pressed: null }
        : here !== undefined
          ? { primary: GO_AHEAD, secondary: null, state: "Working", pressed: "primary" }
          : { primary: GO_AHEAD, secondary: null, state: "Default", pressed: null };
      rows[message.id] = { view, primary: { type: "goAhead" } };
    }
  });
  return rows;
}
