/**
 * Which cards in the conversation are history (FRI-1712 pattern 1).
 *
 * A card is read-only once the person has signed it off, once its step is
 * behind the project, or once it has been superseded: a card of an earlier
 * step came after it, which is how going back leaves every later card in
 * the conversation. The engine's rule for "superseded" is `Turn.isLive` in
 * engine/turn.ts; this is the studio's twin of it, and a check holds the two
 * step orders equal.
 *
 * A read-only card shows gala-card-footer in place of its buttons and
 * chips: "Signed off" when the person approved it, "This step is behind
 * you" when the project moved on without that. Its one action is "Back to
 * this step", offered only where going back is possible: to a step before
 * the current one, which a person can return to.
 *
 * No imports, so the engine's checks can read this file directly.
 */

/** A project's stage, as src/lib/stages.ts and engine/store.ts name them. */
type Stage = "brief" | "research" | "type" | "wordmark" | "symbolOpener" | "directions" | "variations" | "stressTest" | "lockup" | "pickColors" | "colorways" | "kit" | "picks" | "done";

/** The steps in order, the stage each opens with, and the kinds of card each writes. The same order as STEPS in engine/steps.ts. */
export const STEP_ORDER: { stage: Stage; kinds: string[]; canReturn: boolean }[] = [
  { stage: "brief", kinds: ["brief"], canReturn: true },
  { stage: "research", kinds: ["research", "direction"], canReturn: true },
  { stage: "type", kinds: ["typeSet"], canReturn: true },
  { stage: "wordmark", kinds: ["wordmark"], canReturn: true },
  { stage: "symbolOpener", kinds: ["symbolOpener"], canReturn: true },
  { stage: "directions", kinds: ["conceptSet"], canReturn: true },
  { stage: "variations", kinds: ["variationSet"], canReturn: true },
  { stage: "stressTest", kinds: ["stressTest"], canReturn: true },
  { stage: "lockup", kinds: ["lockup"], canReturn: true },
  { stage: "pickColors", kinds: ["colorPicker"], canReturn: true },
  { stage: "colorways", kinds: ["colorwaySet"], canReturn: true },
  { stage: "kit", kinds: ["kit"], canReturn: true },
  { stage: "picks", kinds: ["picks"], canReturn: false },
  { stage: "done", kinds: [], canReturn: false },
];

/** The cards that carry buttons or chips, and so become read-only once past. */
export const HISTORY_KINDS = ["brief", "direction", "typeSet", "wordmark", "conceptSet", "variationSet", "stressTest", "lockup", "colorPicker", "colorwaySet"] as const;

/** How a read-only card's footer reads. `backTo` is the step "Back to this step" returns to, or null when going back there is not possible. */
export type Past = {
  signedOff: boolean;
  backTo: Stage | null;
  /** True while Gala works: going back waits, and the footer says so (FRI-1715). */
  working?: boolean;
};

type Message = { id: string; author: string; kind: string; artifact: Record<string, any> | null };

function stepIndex(stage: Stage): number {
  return STEP_ORDER.findIndex((step) => step.stage === stage);
}

function stepIndexOfKind(kind: string): number {
  return STEP_ORDER.findIndex((step) => step.kinds.includes(kind));
}

/** True when the person approved the card: the sign-off, the pick, or the saved choice. */
export function isSignedOff(kind: string, artifact: Record<string, any>): boolean {
  switch (kind) {
    case "direction":
    case "wordmark":
    case "stressTest":
    case "lockup":
      return artifact.approved === true;
    case "typeSet":
      return artifact.saved === true && artifact.chosenId != null;
    case "colorPicker":
      return artifact.saved === true && artifact.colors != null;
    case "conceptSet":
    case "variationSet":
    case "colorwaySet":
      return artifact.chosenId != null;
    default:
      return false;
  }
}

/** Every read-only card in the conversation, by message id. A card that is not listed is live. */
export function pastCards(messages: Message[], stage: Stage): Record<string, Past> {
  const current = stepIndex(stage);
  const result: Record<string, Past> = {};
  messages.forEach((message, at) => {
    if (message.author !== "gala" || message.artifact === null || !(HISTORY_KINDS as readonly string[]).includes(message.kind)) return;
    const step = stepIndexOfKind(message.kind);
    const superseded = messages.slice(at + 1).some((later) => {
      const laterStep = stepIndexOfKind(later.kind);
      return later.author === "gala" && laterStep >= 0 && laterStep < step;
    });
    const signedOff = isSignedOff(message.kind, message.artifact);
    if (!superseded && !signedOff && step >= current) return;
    const own = STEP_ORDER[step]!;
    result[message.id] = { signedOff, backTo: own.canReturn && step < current ? own.stage : null };
  });
  return result;
}
