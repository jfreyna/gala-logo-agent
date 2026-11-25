import { internalQuery } from "./_generated/server";

/**
 * Gala's persona prompt, the phase instructions and the hall rules.
 *
 * The text is not in this repository. It lives in this deployment's
 * environment, split across numbered values (GALA_PROMPT_01, GALA_PROMPT_02
 * and so on) because one environment value holds at most 8 KiB. This
 * function joins them. It is internal, and exactly one HTTP route calls it
 * (`/engine/prompt` in convex/http.ts), for a caller that holds the shared
 * secret. No query a browser can reach returns any part of it.
 */

/** Convex allows 512 environment values; the prompt will never need this many. */
const MAX_PARTS = 64;

export const read = internalQuery({
  args: {},
  handler: async () => {
    const parts: string[] = [];
    for (let index = 1; index <= MAX_PARTS; index++) {
      const part = process.env[`GALA_PROMPT_${String(index).padStart(2, "0")}`];
      if (part === undefined) break;
      parts.push(part);
    }
    return parts.length === 0 ? null : parts.join("");
  },
});
