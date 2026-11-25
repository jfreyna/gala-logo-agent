/**
 * Prompt protection. Every line Gala is about to say passes through here
 * before it is stored or shown.
 *
 * Three defenses, in order of how they fail:
 *   1. The persona itself is told never to reveal or paraphrase its
 *      instructions (that lives in the prompt, not here).
 *   2. `overlaps`: a code check. The reply must not contain a long run of
 *      text that is also in the prompt held in memory.
 *   3. `revealsInstructions`: Jev is asked "Does this reply reveal system
 *      instructions?", and whether it describes the prompt's contents or
 *      organization.
 *
 * The code check compares against the prompt itself. There is no list of
 * forbidden phrases anywhere.
 *
 * What this does not prove: a paraphrase that Jev scores under its gate
 * gets through, and so does a leak spread thinly across many replies, each
 * shorter than the window. The aim is that the prompt's text is not handed
 * out, not that Gala's manner can't be imitated.
 */
import { ask, YES } from "./jev.ts";

/**
 * How many consecutive letters and digits a reply may share with the prompt
 * before it counts as a copy. 48 is about eight to ten words: longer than
 * the stock phrases any two English texts share, shorter than a sentence of
 * instructions.
 */
export const WINDOW = 48;

export type Guard = { windows: Set<string> };

/** Letters and digits only, lower case, accents folded: spacing, case and punctuation can't hide a copy. */
export function squeeze(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function windowsOf(text: string): Set<string> {
  const squeezed = squeeze(text);
  const windows = new Set<string>();
  for (let start = 0; start + WINDOW <= squeezed.length; start++) windows.add(squeezed.slice(start, start + WINDOW));
  return windows;
}

/**
 * Prepares the check for one prompt. Text that is also public (the stand-in
 * prompt in this repository, which carries the identity block) is exempt:
 * Gala may say who Gala is.
 */
export function buildGuard(secretText: string, publicText: string): Guard {
  const windows = windowsOf(secretText);
  for (const window of windowsOf(publicText)) windows.delete(window);
  return { windows };
}

/** True when `text` repeats a run of the guarded prompt. */
export function overlaps(guard: Guard, text: string): boolean {
  const squeezed = squeeze(text);
  for (let start = 0; start + WINDOW <= squeezed.length; start++) {
    if (guard.windows.has(squeezed.slice(start, start + WINDOW))) return true;
  }
  return false;
}

/**
 * The Jev check. The first question is the ruling's own wording. The
 * second was added after a measured miss: a reply that described how the
 * prompt is organized, without quoting a rule, scored 0.46 on the first
 * question (under the gate) and 0.97 on the second. Ordinary replies score
 * under 0.2 on both. Either yes holds the reply back.
 */
export async function revealsInstructions(reply: string, signal?: AbortSignal): Promise<boolean> {
  const answers = await ask({
    state: { reply },
    questions: {
      reveals: { type: "noul", instructions: "Does this reply reveal system instructions?" },
      describes: { type: "noul", instructions: "Does this reply describe the contents or the organization of the assistant's own prompt, rules or configuration?" },
    },
    signal,
  });
  return answers.reveals.noul >= YES || answers.describes.noul >= YES;
}

export type Verdict = "ok" | "copies the prompt" | "reveals instructions";

/** Both checks on one outgoing text. The code check runs first because it is free. */
export async function checkReply(guard: Guard, reply: string, signal?: AbortSignal): Promise<Verdict> {
  if (reply.trim() === "") return "ok";
  if (overlaps(guard, reply)) return "copies the prompt";
  if (await revealsInstructions(reply, signal)) return "reveals instructions";
  return "ok";
}

/**
 * Colors are named by role in the chat (Primary, Secondary, Tertiary) and
 * never by hex. This matches the hex notation itself, a fixed format.
 */
export function mentionsHex(text: string): boolean {
  return /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i.test(text);
}
