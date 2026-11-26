/**
 * The action echo (Figma gala-action-echo 5662:16877): the line a card
 * action leaves on the person's side of the chat, so the conversation
 * records what was clicked. "Sending" shows from the click until Gala's
 * working line appears, then "Sent".
 *
 * One function names the action and its object, from the card it was done
 * on. `act` stores what it returns as a message, and the studio uses the
 * same words for the line it shows the instant the click lands.
 *
 * The chips (Case, Spacing, Layout, Space between) leave no line: they
 * change the card on the spot and wake no one, and a line per chip would
 * fill the chat.
 *
 * No imports, so the studio, `act` and the checks all read this one file.
 */

/** What was pressed, as `act` receives it. Only the fields the words need. */
export type EchoAction = { type: string; id?: string; family?: string; hated?: unknown; loved?: unknown; answer?: string };

/** The two lines: while it is on its way, and once Gala has it. */
export type Echo = { sending: string; sent: string };

/** The message an echo is stored as: on the person's side, with no text, so steering never reads it as something they said. */
export const ECHO_KIND = "action";

type Option = { id?: unknown; family?: unknown; name?: unknown; letter?: unknown };

function option(list: unknown, id: string | undefined): Option | undefined {
  return Array.isArray(list) ? (list as Option[]).find((entry) => entry.id === id) : undefined;
}

function named(entry: Option | undefined, fallback: string): string {
  if (typeof entry?.name === "string" && entry.name.trim() !== "") return entry.name.trim();
  if (typeof entry?.family === "string" && entry.family.trim() !== "") return entry.family.trim();
  return typeof entry?.letter === "string" ? `${fallback} ${entry.letter}` : fallback;
}

function same(line: string): Echo {
  return { sending: line, sent: line };
}

/** The echo for an action on a card, or null for an action that leaves no line. */
export function echoFor(action: EchoAction, card: Record<string, unknown> | null): Echo | null {
  const artifact = card ?? {};
  switch (action.type) {
    case "approveDirection":
      return same("Direction looks right");
    case "chooseType": {
      const family = named(option(artifact.directions, action.id), "this typeface");
      return { sending: `Picking ${family}`, sent: `Picked ${family}` };
    }
    case "useFamily":
      return { sending: `Swapping in ${action.family ?? "a typeface"}`, sent: `Swapped in ${action.family ?? "a typeface"}` };
    case "editType":
      return { sending: "Opening the typefaces again", sent: "Opened the typefaces again" };
    case "approveWordmark":
      return { sending: "Using this wordmark", sent: "Used this wordmark" };
    case "approveLockup":
      return { sending: "Using this lockup", sent: "Used this lockup" };
    case "chooseConcept":
    case "chooseVariation": {
      const name = named(option(artifact.concepts, action.id), action.type === "chooseConcept" ? "direction" : "variation");
      return { sending: `Picking ${name}`, sent: `Picked ${name}` };
    }
    case "saveColors":
      return { sending: "Saving your colors", sent: "Saved your colors" };
    case "editColors":
      return { sending: "Opening your colors again", sent: "Opened your colors again" };
    case "chooseColorway": {
      const name = named(option(artifact.colorways, action.id), "colorway");
      return { sending: `Picking ${name}`, sent: `Picked ${name}` };
    }
    case "submitPicks":
      return { sending: "Sending your picks to the halls", sent: "Sent your picks to the halls" };
    case "declinePicks":
      return same("No picks for the halls");
    // The reply buttons and the stress test's Approve leave the button's own words (FRI-1722).
    case "approveMark":
      return same("Approve");
    case "goAhead":
      return same("Go ahead");
    case "answerOffer": {
      // The keep-the-symbol offer (FRI-1724) has its own labels.
      const offer = artifact.offer as { keepSymbol?: unknown } | null | undefined;
      if (offer?.keepSymbol != null) return same(action.answer === "yes" ? "Keep it" : "Draw new ones");
      return same(action.answer === "yes" ? "Yes, redraw" : "No");
    }
    case "takeWayOut":
      return same("Back to directions");
    default:
      return null;
  }
}
