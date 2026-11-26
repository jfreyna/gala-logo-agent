/**
 * Rounds: the cards a step has shown since it was last entered.
 *
 * The directions, the variations and the colorways can each be drawn more
 * than once in a row. Every one of those cards is a round of the step, and
 * a person can pick from any of them, by the Pick button (`act` saves the
 * pick on whichever card was pressed) or by name in words. A step reads
 * all of its rounds, not only the newest card.
 *
 * A round belongs to the step's current visit: walking back from the end
 * of the conversation, the rounds are the cards of the step's kind until a
 * Gala card of any other step. Notices, text and the person's own messages
 * don't count. A card from before the step was last entered (a variation
 * picked before the stress test, say) is never a round of this visit, so
 * its old pick never counts again.
 *
 * What this does not prove: that the person meant the round they pressed.
 * A pick is taken as pressed.
 */
import { stepIndexOfKind } from "./steps.ts";
import type { StoredMessage } from "./store.ts";
import type { MarkRef, Turn } from "./turn.ts";

export type RoundKind = "conceptSet" | "variationSet" | "colorwaySet";

/** The list of options on a round's card. */
function listOf(kind: RoundKind): "concepts" | "colorways" {
  return kind === "colorwaySet" ? "colorways" : "concepts";
}

/**
 * The step's rounds, oldest first. For the colorways, only rounds drawn
 * with the colors on the picker now: once the person edits their colors,
 * the rounds before are of other colors, and the newest card must be of
 * the current ones or there is no round yet.
 */
export function roundsOf(turn: Turn, kind: RoundKind): StoredMessage[] {
  const rounds: StoredMessage[] = [];
  const messages = turn.state.messages;
  for (let at = messages.length - 1; at >= 0; at--) {
    const message = messages[at]!;
    if (message.author !== "gala" || message.artifact === null) continue;
    if (message.kind === kind) {
      rounds.unshift(message);
      continue;
    }
    if (stepIndexOfKind(message.kind) >= 0) break;
  }
  if (kind !== "colorwaySet") return rounds;
  const colors = JSON.stringify(turn.latest("colorPicker")?.artifact?.colors ?? null);
  const same = (round: StoredMessage) => JSON.stringify(round.artifact!.colors) === colors;
  const newest = rounds[rounds.length - 1];
  return newest !== undefined && same(newest) ? rounds.filter(same) : [];
}

/** The newest round that carries a pick, or null. */
export function pickedRound(rounds: StoredMessage[]): StoredMessage | null {
  return rounds.findLast((round) => round.artifact!.chosenId !== null && round.artifact!.chosenId !== undefined) ?? null;
}

/** Where a round sits in the step: its number, how many there are, and how many came after it. */
export type RoundPlace = { round: number; of: number; roundsAfterIt: number };

export function placeOf(rounds: StoredMessage[], card: StoredMessage): RoundPlace {
  const at = rounds.findIndex((round) => round.id === card.id);
  return { round: at + 1, of: rounds.length, roundsAfterIt: rounds.length - at - 1 };
}

/** One option on one of the step's rounds. */
export type RoundOption = {
  /** The newest round's options by letter, as before; an earlier round's by its id. */
  key: string;
  id: string;
  letter: string;
  name: string;
  card: StoredMessage;
  place: RoundPlace;
};

/** Every option on every round, newest round first. A round that carries a pick is done, so none are offered while one does. */
export function roundOptions(rounds: StoredMessage[], kind: RoundKind): RoundOption[] {
  const newest = rounds[rounds.length - 1];
  return [...rounds].reverse().flatMap((card) =>
    (card.artifact![listOf(kind)] as { id: string; letter: string; name?: string }[]).map((entry) => ({
      key: card === newest ? entry.letter : entry.id,
      id: entry.id,
      letter: entry.letter,
      name: entry.name || entry.letter,
      card,
      place: placeOf(rounds, card),
    })),
  );
}

/** How an option is named to Jev and the model: what it is, and which round it is on when that is not the newest. */
export function optionLabel(option: RoundOption, noun: string): string {
  const base = `${noun} ${option.letter}, ${option.name}`;
  if (option.place.roundsAfterIt === 0) return base;
  return `${base}, on round ${option.place.round} of ${option.place.of} of this step (${option.place.roundsAfterIt} round${option.place.roundsAfterIt === 1 ? "" : "s"} before the newest)`;
}

/** A mark on a round, as a request and a round's `startedFrom` carry it. */
export function markOf(option: RoundOption): MarkRef {
  const entry = (option.card.artifact!.concepts as { id: string; name: string; markFileId: string; sourceFileId: string }[]).find((concept) => concept.id === option.id)!;
  return { id: entry.id, name: entry.name, markFileId: entry.markFileId, sourceFileId: entry.sourceFileId, round: option.place };
}

/** True when `value` is a mark reference this code wrote (a round's `startedFrom` on an older card may be missing). */
export function isMarkRef(value: unknown): value is MarkRef {
  const mark = value as MarkRef | null;
  return typeof mark === "object" && mark !== null && typeof mark.id === "string" && typeof mark.name === "string" && typeof mark.sourceFileId === "string";
}
