/**
 * Gala's storage on the `frilly-gala` Convex project.
 *
 * Every call carries two proofs: the person's own sign-in token, which
 * says whose project this is, and the server's shared secret, which says
 * the call comes from Gala's server. Storage checks both (see
 * convex/http.ts). Neither is ever logged, and the token is held only for
 * the length of one turn.
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

export class ConvexStore implements Store {
  private readonly projectId: string;
  private readonly turnId: string;
  private readonly token: string;

  constructor(options: { projectId: string; turnId: string; token: string }) {
    this.projectId = options.projectId;
    this.turnId = options.turnId;
    this.token = options.token;
  }

  private headers(contentType: string): Record<string, string> {
    const secret = config.serverSecret;
    if (secret === null) throw new StorageError(503, "The shared secret is not set on this server.");
    return { Authorization: `Bearer ${this.token}`, "x-gala-server": secret, "Content-Type": contentType };
  }

  private async call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${config.storageUrl}${path}`, {
      method: "POST",
      headers: this.headers("application/json"),
      body: JSON.stringify({ projectId: this.projectId, turnId: this.turnId, ...body }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      // Storage's own short message ("Project not found."); never the request.
      const detail = await response.json().catch(() => ({ error: "no answer" }));
      throw new StorageError(response.status, `Storage refused ${path}: ${detail.error ?? response.status}`);
    }
    return (await response.json()) as T;
  }

  async begin(): Promise<Project | "busy"> {
    const answer = await this.call<({ busy: false } & Project) | { busy: true }>("/engine/begin", {});
    return answer.busy ? "busy" : answer;
  }

  async write(operations: Operation[]): Promise<void> {
    await this.call("/engine/write", { operations });
  }

  async end(): Promise<void> {
    await this.call("/engine/end", {});
  }

  async saveFile(bytes: Uint8Array, contentType: string): Promise<string> {
    const response = await fetch(`${config.storageUrl}/engine/file`, { method: "POST", headers: this.headers(contentType), body: bytes, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new StorageError(response.status, `Storage refused a file (${response.status})`);
    return ((await response.json()) as { fileId: string }).fileId;
  }

  async readFile(fileId: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const response = await fetch(`${config.storageUrl}/engine/file?id=${encodeURIComponent(fileId)}`, { headers: this.headers("application/json"), signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new StorageError(response.status, `Storage could not read a file (${response.status})`);
    return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("Content-Type") ?? "application/octet-stream" };
  }

  /** Files a line the person added to memory under a heading. Outside any turn. */
  async fileMemory(memoryId: string, group: string): Promise<void> {
    const response = await fetch(`${config.storageUrl}/engine/memory`, {
      method: "POST",
      headers: this.headers("application/json"),
      body: JSON.stringify({ memoryId, group }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new StorageError(response.status, `Storage refused the memory line (${response.status})`);
  }
}
