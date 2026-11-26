import { authClient } from "./auth";

/**
 * Calls to Gala's own server (the engine), which sits at the same address
 * as this page. Each carries the person's Convex token, which the server
 * hands to storage; storage is what checks it.
 *
 * The answers hold a state ("working", "done") and nothing else. What Gala
 * says arrives through the live queries, never through these calls.
 */
async function token(): Promise<string | null> {
  const { data } = await authClient.convex.token();
  return data?.token ?? null;
}

/** The last state the server reported, or null when the call could not be made. */
async function post(path: string, body: Record<string, unknown>): Promise<string | null> {
  // A new token for every call: it is asked for here, never kept.
  const bearer = await token();
  if (bearer === null) return null;
  const response = await fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // The turn's answer stays open until Gala is done, one state per line; the last line is how it ended.
  const lines = (await response.text()).trim().split("\n");
  try {
    return (JSON.parse(lines[lines.length - 1] ?? "") as { state?: string }).state ?? null;
  } catch {
    return null;
  }
}

/**
 * Asks Gala to take a turn on a project; with `back`, the turn first goes
 * back to that step ("Back to this step" in the Work panel); with `retry`,
 * it is a Try again on a notice, which replays what the turn failed on or
 * says nothing was owed (FRI-1729). Resolves when the turn ends, with
 * how it ended: "done", "stopped", "busy", "signin" (the sign-in was
 * refused when the turn opened), "trouble", or null when nothing answered.
 */
export function requestTurn(projectId: string, back?: string, options: { retry?: boolean } = {}): Promise<string | null> {
  return post("/api/turn", { projectId, ...(back === undefined ? {} : { back }), ...(options.retry === true ? { retry: true } : {}) }).catch(() => null);
}

/** Stops the turn in progress. True when the server stopped it, or no turn was running. */
export function stopTurn(projectId: string): Promise<boolean> {
  return post("/api/stop", { projectId }).then(
    (state) => state === "stopped" || state === "idle",
    () => false,
  );
}

/** Asks Gala to file a line the person added to memory under its heading. True when it was filed. */
export function fileMemoryLine(memoryId: string, text: string): Promise<boolean> {
  return post("/api/memory", { memoryId, text }).then(
    (state) => state === "done",
    () => false,
  );
}

/**
 * Saves a stored file under its own name. Storage addresses are on another
 * origin, so a plain link can't name the download. True when the file was
 * fetched and handed to the browser; false when it couldn't be fetched, so
 * the button can say so (FRI-1712 gap N).
 */
export async function download(url: string, fileName: string): Promise<boolean> {
  let blob: Blob;
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    blob = await response.blob();
  } catch {
    return false;
  }
  const address = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = address;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(address);
  return true;
}
