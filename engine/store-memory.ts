/**
 * Gala's storage held in memory, for checks. It applies the same
 * operations the real store does, to plain arrays, so a full brief can run
 * on the Sprite against the real models with a scripted person and no
 * sign-in. It is never used to serve anyone.
 */
import type { MemoryLine, Operation, Project, Stage, Store, StoredFile, StoredMessage } from "./store.ts";

export class MemoryStore implements Store {
  project: { id: string; brandName: string; stage: Stage } = { id: "project", brandName: "", stage: "brief" };
  messages: StoredMessage[] = [];
  choices: Project["choices"] = [];
  memory: MemoryLine[] = [];
  quotes: (Project["quotesToCheck"][number] & { check: "none" | "passed" | "failed" })[] = [];
  files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  kit: { files: StoredFile[]; downloads: StoredFile[]; spec: unknown } | null = null;
  status = "";
  private next = 1;

  private id(prefix: string): string {
    return `${prefix}_${this.next++}`;
  }

  /** The person says something. */
  visitorSays(text: string, upload?: { bytes: Uint8Array; contentType: string; fileName: string }): void {
    let attached: StoredMessage["upload"] = null;
    if (upload) {
      const fileId = this.id("file");
      this.files.set(fileId, { bytes: upload.bytes, contentType: upload.contentType });
      attached = { fileId, fileName: upload.fileName, contentType: upload.contentType };
    }
    this.messages.push({ id: this.id("message"), author: "visitor", kind: attached ? "upload" : "text", text, artifact: null, upload: attached });
  }

  /** The newest card of a kind, for the scripted person to act on. */
  latest(kind: string): StoredMessage {
    const message = this.messages.findLast((entry) => entry.kind === kind);
    if (message === undefined) throw new Error(`No ${kind} card yet.`);
    return message;
  }

  async begin(): Promise<Project> {
    return structuredClone({
      project: this.project,
      messages: this.messages,
      choices: this.choices,
      memory: this.memory,
      quotesToCheck: this.quotes.filter((quote) => quote.check === "none").map(({ id, hall, quote }) => ({ id, hall, quote })),
    });
  }

  async write(operations: Operation[]): Promise<void> {
    const refs = new Map<string, string>();
    for (const item of operations) {
      switch (item.op) {
        case "say":
          this.messages.push({ id: this.id("message"), author: "gala", kind: "text", text: item.text, artifact: null, upload: null });
          break;
        case "artifact": {
          const id = this.id("message");
          if (item.ref !== undefined) refs.set(item.ref, id);
          this.messages.push({ id, author: "gala", kind: item.kind, text: null, artifact: structuredClone(item.artifact), upload: null });
          break;
        }
        case "patchArtifact": {
          const message = this.messages.find((entry) => entry.id === item.messageId);
          if (message === undefined) throw new Error("Card not found.");
          message.artifact = structuredClone(item.artifact);
          break;
        }
        case "status":
          this.status = item.text;
          break;
        case "project":
          if (item.brandName !== undefined) this.project.brandName = item.brandName;
          if (item.stage !== undefined) this.project.stage = item.stage;
          break;
        case "choice": {
          const existing = this.choices.find((choice) => choice.step === item.step);
          if (existing) Object.assign(existing, { chosen: item.chosen ?? null, discarded: item.discarded });
          else this.choices.push({ step: item.step, chosen: item.chosen ?? null, discarded: item.discarded });
          break;
        }
        case "remember":
          if (!this.memory.some((line) => line.text === item.text)) this.memory.push({ id: this.id("memory"), group: item.group, text: item.text, writtenBy: "gala" });
          break;
        case "kit":
          this.kit = { files: item.files, downloads: item.downloads, spec: item.spec };
          break;
        case "quoteChecked": {
          const quote = this.quotes.find((entry) => entry.id === item.submissionId);
          if (quote) quote.check = item.passed ? "passed" : "failed";
          break;
        }
      }
    }
  }

  async end(): Promise<void> {
    this.status = "";
  }

  async saveFile(bytes: Uint8Array, contentType: string): Promise<string> {
    const fileId = this.id("file");
    this.files.set(fileId, { bytes, contentType });
    return fileId;
  }

  async readFile(fileId: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const file = this.files.get(fileId);
    if (file === undefined) throw new Error("File not found.");
    return file;
  }
}
