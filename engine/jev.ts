/**
 * Jev, TypeSafe's structured evaluator, through the Sprites connector.
 *
 * Jev answers three kinds of question about a state: yes or no (`noul`), a
 * pick from named options (`choice`) and a score on a rubric (`score`).
 * Gala uses it wherever an answer comes from a known set, and for every
 * check on a draft or a reply. A generative model writes; Jev decides.
 */
import { config } from "./config.ts";
import { ModelError, type Image } from "./gemini.ts";

export type YesNo = { type: "noul"; instructions: string };
export type Choice = { type: "choice"; instructions: string; criteria: Record<string, string | null> };
export type Score = { type: "score"; instructions: string; criteria: string[] };
export type Question = YesNo | Choice | Score;

export type Answer<Q extends Question> = Q extends YesNo
  ? { noul: number }
  : Q extends Choice
    ? { choice: string; confidence: number; probabilities: Record<string, number> }
    : { score: number; confidence: number };

/** At or above this, a yes/no answer counts as yes. */
export const YES = 0.5;
/** Below this, a choice is too unsure to act on, and Gala asks the person instead. */
export const SURE = 0.5;

const ATTEMPTS = 3;

/**
 * Asks Jev `questions` about `state`. Images are passed as assets and named
 * in the state by their key, as TypeSafe's API expects. TypeSafe refuses
 * images under 280px a side; callers send renders at about 512px.
 */
export async function ask<Q extends Record<string, Question>>(options: {
  state: Record<string, unknown>;
  questions: Q;
  images?: Record<string, Image>;
  signal?: AbortSignal;
}): Promise<{ [K in keyof Q]: Answer<Q[K]> }> {
  const images = options.images ?? {};
  const hasImages = Object.keys(images).length > 0;
  const body = {
    model: config.jevModel,
    state: { ...options.state, ...Object.fromEntries(Object.keys(images).map((key) => [key, key])) },
    ...(hasImages
      ? {
          assets: Object.fromEntries(
            Object.entries(images).map(([key, image]) => [
              key,
              { type: "image", format: image.mime === "image/png" ? "png" : "jpg", data_base64: Buffer.from(image.bytes).toString("base64") },
            ]),
          ),
        }
      : {}),
    questions: options.questions,
  };
  let lastError = "no attempt made";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const timeout = AbortSignal.timeout(60_000);
    try {
      const response = await fetch(`${config.typesafeUrl}/v1/systemone`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(hasImages ? { "TypeSafe-Danger-Zone-Images": "true" } : {}) },
        body: JSON.stringify(body),
        signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      });
      if (response.ok) return ((await response.json()) as { answers: { [K in keyof Q]: Answer<Q[K]> } }).answers;
      lastError = `HTTP ${response.status}`;
      if (response.status < 500 && response.status !== 429 && response.status !== 408) break;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      lastError = error instanceof Error ? error.name : "network error";
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
  throw new ModelError(`Jev did not answer (${lastError})`);
}
