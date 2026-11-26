/**
 * Gala's answer when something didn't work (Figma gala-notice 5661:16975):
 * plain words, the cause in the person's terms, and a
 * way forward.
 *
 * A notice is a card of kind "notice" in the conversation. It carries its
 * kind, the step it was written at, and its cause, so the next failure can
 * tell whether it is the same one: the second identical failure in a row
 * at the same step is "Repeated", which stops asking for a retry and offers
 * a step back instead.
 *
 * The lines here are fixed, not a model's: a notice is written exactly when
 * a model's answer can't be relied on. "Stopped" is written on its own (below).
 */
import { CannotSet } from "../kit/src/font.ts";
import { ModelError } from "./gemini.ts";
import { cannotDrawLine, NEXT_MOVE } from "./lines.ts";
import { STEPS, stepIndex } from "./steps.ts";
import { StorageError } from "./store-convex.ts";
import type { Stage, StoredMessage } from "./store.ts";

export const NOTICE_KIND = "notice";

/** What failed, as far as the code knows. */
export type Cause = "font" | "color" | "model" | "storage" | "unknown" | "stopped";

/**
 * What a notice's button does in the studio: go back to a step, show the
 * type card that is waiting for a pick, ask for the turn again, or hand the
 * next move to the message box.
 */
export type NoticeAction = { label: string; do: "back"; step: Stage } | { label: string; do: "showType" } | { label: string; do: "retry" } | { label: string; do: "prompt" };

export type Notice = {
  kind: "couldnt" | "repeated" | "stopped";
  /** The stage the failure happened at. */
  step: Stage;
  cause: Cause;
  /** The small line above the words: "Couldn’t draw the wordmark". */
  title: string;
  say: string;
  actions: NoticeAction[];
};

/** The step names a "Go back to" button says, as the Work panel names them. */
const STEP_NAMES: Partial<Record<Stage, string>> = {
  brief: "Brief",
  research: "Research",
  type: "Type",
  wordmark: "Wordmark",
  symbolOpener: "Symbol",
  directions: "Directions",
  variations: "Variations",
  stressTest: "Stress test",
  lockup: "Lockup",
  pickColors: "Color",
  colorways: "Color",
  kit: "Kit",
};

/**
 * Gala's line after Stop (gala-notice Kind=Stopped). `kept` is
 * true when the turn had already written something before it was stopped:
 * the words alone, no button, since replaying would redo work already in.
 * When nothing was kept it offers Try again, which replays the stopped
 * request once (Kind=Stopped with retry); a
 * stop is not a failure, so stopping again never escalates to Repeated.
 */
export function stoppedNotice(stage: Stage, kept: boolean): Notice {
  if (kept) return { kind: "stopped", step: stage, cause: "stopped", title: "Stopped", say: "Stopped. Tell me what to do next.", actions: [] };
  return {
    kind: "stopped",
    step: stage,
    cause: "stopped",
    title: "Stopped",
    say: "Stopped. Nothing from that turn was kept. Try again, or tell me what to do next.",
    actions: [{ label: "Try again", do: "retry" }],
  };
}

/**
 * Gala's line when Try again finds nothing owed: what it failed
 * on was answered since, or the turn was stopped on purpose. A fixed line,
 * never silence, with the step's next move.
 */
export function nothingOwedLine(stage: Stage): string {
  return `Nothing from before is waiting on me, so there’s nothing to try again. ${NEXT_MOVE[stage]}`;
}

/** The cause of an error, in the terms the notice speaks. */
export function causeOf(error: unknown): Cause {
  if (error instanceof CannotSet) return error.why === "color" ? "color" : "font";
  if (error instanceof ModelError) return "model";
  if (error instanceof StorageError) return "storage";
  return "unknown";
}

/** The step before this one that a person can go back to, or null at the brief. */
function stepBefore(stage: Stage): Stage | null {
  const earlier = STEPS.slice(0, Math.max(stepIndex(stage), 0)).filter((step) => step.canReturn);
  // The symbol opener and the directions are one step in the studio: going back from either goes to the wordmark.
  const before = earlier.filter((step) => !(stage === "directions" && step.stage === "symbolOpener"));
  return before[before.length - 1]?.stage ?? null;
}

/**
 * The notice for a failure. `name` is the name as set, for a typeface that
 * can't draw it. `previous` is Gala's last message: when it is a notice for
 * the same cause at the same step, this failure is the second in a row.
 */
export function noticeFor(error: unknown, stage: Stage, name: string, previous: StoredMessage | null): Notice {
  const cause = causeOf(error);
  const last = previous?.kind === NOTICE_KIND ? (previous.artifact as Notice | null) : null;
  if (last !== null && last.step === stage && last.cause === cause) {
    const back = stepBefore(stage);
    return {
      kind: "repeated",
      step: stage,
      cause,
      title: "Same problem twice",
      say: back !== null ? "That failed the same way twice, so another try won’t help. We can go back a step, or you can tell me something different to try here." : "That failed the same way twice, so another try won’t help. Tell me something different to try here.",
      actions: [...(back !== null ? [{ label: `Go back to ${STEP_NAMES[back] ?? back}`, do: "back" as const, step: back }] : []), { label: "Tell me what to try", do: "prompt" }],
    };
  }
  return firstNotice(error, stage, name, cause);
}

function firstNotice(error: unknown, stage: Stage, name: string, cause: Cause): Notice {
  const atType = stage === "type";
  const chooseAgain: NoticeAction = atType ? { label: "Choose another typeface", do: "showType" } : { label: "Choose another typeface", do: "back", step: "type" };
  switch (cause) {
    case "font":
    case "color": {
      const problem = error as CannotSet;
      return {
        kind: "couldnt",
        step: stage,
        cause,
        title: cause === "color" ? "Couldn’t use that typeface" : atType ? "Couldn’t set that typeface" : "Couldn’t draw the wordmark",
        say: cannotDrawLine(name, problem, atType),
        actions: [chooseAgain],
      };
    }
    case "model":
      return {
        kind: "couldnt",
        step: stage,
        cause,
        title: "Couldn’t reach my tools",
        say: "I couldn’t reach the tools I draw and check with, so I stopped before showing you anything half done. Nothing you chose is lost. Try again in a moment.",
        actions: [{ label: "Try again", do: "retry" }],
      };
    case "storage":
      return {
        kind: "couldnt",
        step: stage,
        cause,
        title: "Couldn’t save my work",
        say: "I couldn’t save what I made just now, so I stopped there. Nothing you chose is lost. Try again and I’ll pick it up.",
        actions: [{ label: "Try again", do: "retry" }],
      };
    default:
      return {
        kind: "couldnt",
        step: stage,
        cause,
        title: "Something went wrong",
        say: "Something went wrong on my side, and I stopped before showing you anything half done. Nothing you chose is lost. Try again and I’ll pick it up.",
        actions: [{ label: "Try again", do: "retry" }],
      };
  }
}
