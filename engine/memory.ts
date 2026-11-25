/**
 * What Gala remembers about a person across projects.
 *
 * This is the only module that knows how memory is read and filed. Today a
 * person's lines are few, so all of them are handed to the model on every
 * step: nothing is cut before it is judged. If memory moves to a vector
 * store later, `recall` is the one function that changes.
 */
import { ask, SURE } from "./jev.ts";
import type { Project } from "./store.ts";

/** The headings of the Memory view, each with what belongs under it. */
export const HEADINGS = {
  "About you": "A fact about who the person is, who they work for, or how they like to work",
  "Your taste": "What the person likes or avoids in design",
  "From past projects": "What was made or chosen on an earlier logo project",
} as const;

export type Heading = keyof typeof HEADINGS;

/** Used when Jev is not sure which heading fits. */
const DEFAULT_HEADING: Heading = "About you";

/** Every line Gala has about the person, as "Heading: line". */
export function recall(state: Project): string[] {
  return state.memory.map((line) => `${line.group}: ${line.text}`);
}

/** The heading a new line belongs under. Jev picks from the three. */
export async function headingFor(line: string, signal?: AbortSignal): Promise<Heading> {
  const answers = await ask({
    state: { line },
    questions: { heading: { type: "choice", instructions: "Which heading does `line` belong under?", criteria: HEADINGS } },
    signal,
  });
  return answers.heading.confidence >= SURE ? (answers.heading.choice as Heading) : DEFAULT_HEADING;
}
