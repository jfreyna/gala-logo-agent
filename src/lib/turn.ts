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

async function post(path: string, body: Record<string, unknown>): Promise<void> {
  const bearer = await token();
  if (bearer === null) return;
  const response = await fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // The turn's answer stays open until Gala is done; read it to the end.
  await response.text();
}

/** Asks Gala to take a turn on a project. Resolves when the turn ends. */
export function requestTurn(projectId: string): Promise<void> {
  return post("/api/turn", { projectId }).catch(() => undefined);
}

/** Stops the turn in progress. */
export function stopTurn(projectId: string): Promise<void> {
  return post("/api/stop", { projectId }).catch(() => undefined);
}

/** Asks Gala to file a line the person added to memory under its heading. */
export function fileMemoryLine(memoryId: string, text: string): Promise<void> {
  return post("/api/memory", { memoryId, text }).catch(() => undefined);
}

/** Saves a stored file under its own name. Storage addresses are on another origin, so a plain link can't name the download. */
export async function download(url: string, fileName: string): Promise<void> {
  const blob = await (await fetch(url)).blob();
  const address = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = address;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(address);
}
