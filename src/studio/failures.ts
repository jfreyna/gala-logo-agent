/**
 * What the studio decides when something fails (FRI-1714), kept apart from
 * the page so a check can run it: how a stored notice is drawn, what
 * Couldn't start says, what a turn request that did not start leads to, and
 * a send that keeps the person's words when it fails.
 *
 * No imports, so the checks can read this file directly.
 */

/** A notice's button, as the engine writes it (engine/notice.ts). */
export type NoticeAction = { label: string; do: "back"; step: string } | { label: string; do: "showType" } | { label: string; do: "retry" } | { label: string; do: "prompt" };

/** A notice as gala-notice draws it. */
export type NoticeData = {
  kind: "Couldn't" | "Couldn't start" | "Repeated" | "Stopped";
  title: string;
  say: string;
  actions: NoticeAction[];
};

/** A notice as the engine stores it (engine/notice.ts), drawn as gala-notice. */
export function noticeOf(stored: { kind?: string; title?: string; say?: string; actions?: NoticeAction[] }): NoticeData {
  const kind = stored.kind === "repeated" ? "Repeated" : stored.kind === "stopped" ? "Stopped" : "Couldn't";
  return { kind, title: stored.title ?? "", say: stored.say ?? "", actions: stored.actions ?? [] };
}

/**
 * Couldn't start (gap D): the turn never began, after the page asked for it
 * a few times. What the person did is already saved; Try again asks once
 * more. `reason` is how the last request ended.
 */
export function couldNotStart(reason: string, saved: "choice" | "message"): NoticeData {
  const why = reason === "busy" ? "my studio is busy right now" : reason === "signin" ? "your sign-in ran out, so sign in again first" : "the connection to my studio dropped";
  return {
    kind: "Couldn't start",
    title: "Couldn’t start",
    say: `I couldn’t start on that: ${why}. Your ${saved} is saved, so nothing is lost.`,
    actions: [{ label: "Try again", do: "retry" }],
  };
}

/**
 * What follows a request for a turn: nothing more (the turn ran or was
 * stopped), another try after a pause, or Couldn't start once the retries
 * are used up. `state` is how the request ended, null when nothing answered.
 */
export function afterRequest(state: string | null, attempt: number, retries: number): { next: "none" } | { next: "retry"; afterMs: number } | { next: "couldNotStart"; reason: string } {
  if (state === "done" || state === "stopped" || state === "trouble") return { next: "none" };
  if (attempt < retries) return { next: "retry", afterMs: 2000 * (attempt + 1) };
  return { next: "couldNotStart", reason: state ?? "network" };
}

/**
 * Sends the person's message, with the file if one is attached. Resolves
 * with null when it went through, so the caller clears the box and the
 * file; otherwise with the line for under the bar, and the caller keeps
 * both (Send failed, pattern 6).
 */
export async function sendKeepingInput(options: {
  words: string;
  attached: { name: string } | null;
  upload: () => Promise<string | undefined>;
  send: (uploadId: string | undefined) => Promise<unknown>;
  messageOf: (error: unknown) => string;
}): Promise<string | null> {
  try {
    const uploadId = options.attached !== null ? await options.upload() : undefined;
    await options.send(uploadId);
    return null;
  } catch (error) {
    const reason = options.messageOf(error);
    return `${reason} Your words are still here${options.attached !== null && /file/i.test(reason) ? "; attach a smaller file or send without it." : "."}`;
  }
}
