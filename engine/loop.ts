/**
 * The agent loop.
 *
 * Code owns the process: the order of the steps, "always three", the
 * checks, the contrast numbers and the kit. The model owns the words and
 * the drawings. Jev owns every pick from a known set. A reply from a model
 * can't skip a step or add a fourth option, because no model decides what
 * happens next: `STAGES` does.
 *
 * A turn runs the current stage, and keeps going through stages until one
 * of them needs the person. Every step needs the person before the next
 * one opens: a stage returns "continue" only after its own sign-off.
 */
import { TROUBLE_LINE } from "./lines.ts";
import type { Prompt } from "./prompt.ts";
import { brief } from "./stages/brief.ts";
import { colorways, pickColors } from "./stages/color.ts";
import { directions, variations } from "./stages/directions.ts";
import { done, kit, picks } from "./stages/kit.ts";
import { lockup } from "./stages/lockup.ts";
import { symbolOpener } from "./stages/opener.ts";
import { research } from "./stages/research.ts";
import { stressTest } from "./stages/stress.ts";
import { type } from "./stages/type.ts";
import { wordmark } from "./stages/wordmark.ts";
import { steer } from "./steer.ts";
import type { Stage, Store } from "./store.ts";
import { Turn, type Outcome } from "./turn.ts";

const STAGES: Record<Stage, (turn: Turn) => Promise<Outcome>> = {
  brief,
  research,
  type,
  wordmark,
  symbolOpener,
  directions,
  variations,
  stressTest,
  lockup,
  pickColors,
  colorways,
  kit,
  picks,
  done,
};

/** More stages than a turn can pass through; a guard against a loop that never waits. */
const MAX_STAGES_PER_TURN = 15;

export type TurnResult = "done" | "busy" | "stopped" | "trouble";

/**
 * `back` is a "Back to this step" press in the Work panel: the turn goes
 * back to that step, the same move as a spoken "go back".
 */
export async function runTurn(store: Store, prompt: Prompt, signal: AbortSignal, options: { back?: Stage } = {}): Promise<TurnResult> {
  const turn = new Turn(store, prompt, signal);
  if (!(await turn.read())) return "busy";
  try {
    // The person's message is read once, before the step runs; code moves the stage (steer.ts).
    await steer(turn, options);
    for (let step = 0; step < MAX_STAGES_PER_TURN; step++) {
      if ((await STAGES[turn.stage](turn)) === "wait") return "done";
    }
    throw new Error(`The turn did not settle at stage ${turn.stage}.`);
  } catch (error) {
    if (signal.aborted) return "stopped";
    // The cause goes to the server log; the person gets a plain line.
    console.error(`Turn failed at stage ${turn.stage}: ${error instanceof Error ? error.message : "unknown error"}`);
    await store.write([{ op: "say", text: TROUBLE_LINE }]).catch(() => undefined);
    return "trouble";
  } finally {
    await store.end().catch(() => undefined);
  }
}
