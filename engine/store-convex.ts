/**
 * Gala's storage on the `frilly-gala` Convex project.
 *
 * Every call carries the server's shared secret, which says the call comes
 * from Gala's server. Opening a turn also carries the person's own sign-in
 * token, which says whose project it is; storage checks it, and only the
 * project's owner can open a turn. From then on the turn's own id stands
 * for the person: it is random, storage holds it as the project's lock,
 * and it works only on that project and only while the lock lasts (see
 * convex/http.ts).
 *
 * The token is used once and then dropped, so a turn cannot fail halfway
 * because the token ran out. Neither the token nor the secret is ever
 * logged.
 */
import { config } from "./config.ts";
import type { Operation, Project, Store } from "./store.ts";

export class StorageError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function secretHeader(): Record<string, string> {
  const secret = config.serverSecret;
  if (secret === null) throw new StorageError(503, "The shared secret is not set on this server.");
  return { "x-gala-server": secret };
}

/** One call to storage. Throws storage's own short message ("This turn is over."), never the request. */
async function call<T>(path: string, body: Record<string, unknown>, token?: string): Promise<T> {
  const response = await fetch(`${config.storageUrl}${path}`, {
    method: "POST",
    headers: { ...secretHeader(), "Content-Type": "application/json", ...(token !== undefined ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ error: "no answer" }));
    throw new StorageError(response.status, `Storage refused ${path}: ${detail.error ?? response.status}`);
  }
  return (await response.json()) as T;
}

export class ConvexStore implements Store {
  private readonly projectId: string;
  private readonly turnId: string;
  /** The person's token, held only until the turn is open. Null for a turn that is open already. */
  private token: string | null;

  constructor(options: { projectId: string; turnId: string; token: string | null }) {
    this.projectId = options.projectId;
    this.turnId = options.turnId;
    this.token = options.token;
  }

  private get turn(): { projectId: string; turnId: string } {
    return { projectId: this.projectId, turnId: this.turnId };
  }

  /** The turn, as the file routes take it: in headers, because the body is the file. */
  private turnHeaders(contentType: string): Record<string, string> {
    return { ...secretHeader(), "x-gala-project": this.projectId, "x-gala-turn": this.turnId, "Content-Type": contentType };
  }

  async begin(): Promise<Project | "busy"> {
    // A turn that is open already has no token to show; its id is what it has.
    if (this.token === null) return this.read();
    const answer = await call<({ busy: false } & Project) | { busy: true }>("/engine/begin", this.turn, this.token);
    this.token = null;
    return answer.busy ? "busy" : answer;
  }

  async read(): Promise<Project> {
    return call<Project>("/engine/read", this.turn);
  }

  async write(operations: Operation[]): Promise<void> {
    await call("/engine/write", { ...this.turn, operations });
  }

  async end(): Promise<void> {
    await call("/engine/end", this.turn);
  }

  async saveFile(bytes: Uint8Array, contentType: string): Promise<string> {
    const response = await fetch(`${config.storageUrl}/engine/file`, { method: "POST", headers: this.turnHeaders(contentType), body: bytes, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new StorageError(response.status, `Storage refused a file (${response.status})`);
    return ((await response.json()) as { fileId: string }).fileId;
  }

  async readFile(fileId: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const response = await fetch(`${config.storageUrl}/engine/file?id=${encodeURIComponent(fileId)}`, { headers: this.turnHeaders("application/json"), signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new StorageError(response.status, `Storage could not read a file (${response.status})`);
    return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("Content-Type") ?? "application/octet-stream" };
  }
}

/** Whether the person with this token owns the project. Asked before a turn is stopped at their request. */
export async function ownsProject(projectId: string, token: string): Promise<boolean> {
  return (await call<{ owns: boolean }>("/engine/owns", { projectId }, token)).owns;
}

/** Files a line the person added to memory under a heading. Outside any turn, so it carries the person's token. */
export async function fileMemoryLine(memoryId: string, group: string, token: string): Promise<void> {
  await call("/engine/memory", { memoryId, group }, token);
}
