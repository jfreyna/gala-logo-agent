/**
 * Gala's storage, as the engine sees it.
 *
 * The engine reads and writes a project through this one interface. On the
 * server it is backed by the `frilly-gala` Convex project
 * (store-convex.ts); in checks it is backed by plain memory
 * (store-memory.ts), which lets a whole brief run against the real models
 * with no sign-in. The engine cannot tell which one it has.
 */

export type Stage = "brief" | "research" | "type" | "wordmark" | "symbolOpener" | "directions" | "variations" | "stressTest" | "lockup" | "pickColors" | "colorways" | "kit" | "picks" | "done";

export type StoredMessage = {
  id: string;
  author: "visitor" | "gala";
  /** "text", "upload", or the name of the card the message carries. */
  kind: string;
  text: string | null;
  artifact: Record<string, any> | null;
  upload: { fileId: string; fileName: string; contentType: string } | null;
};

export type MemoryLine = { id: string; group: string; text: string; writtenBy: "visitor" | "gala" };

/** Everything Gala knows about a project when a turn opens. */
export type Project = {
  project: { id: string; brandName: string; stage: Stage };
  messages: StoredMessage[];
  choices: { step: Stage; chosen: string | null; discarded: string[] }[];
  memory: MemoryLine[];
  quotesToCheck: { id: string; hall: "fame" | "shame"; quote: string }[];
  /** Requests the person made ahead of their step, kept for it in their own words. */
  held: HeldIdea[];
};

export type HeldIdea = { step: Stage; text: string };

export type StoredFile = { label: string; fileName: string; contentType: string; fileId: string };

/** One thing Gala writes. A list of these is applied together. */
export type Operation =
  | { op: "say"; text: string }
  | { op: "artifact"; kind: string; artifact: Record<string, unknown>; ref?: string }
  | { op: "patchArtifact"; messageId: string; artifact: Record<string, unknown> }
  | { op: "status"; text: string }
  | { op: "project"; brandName?: string; stage?: Stage; latestMarkFileId?: string }
  | { op: "choice"; step: Stage; chosen?: string; discarded: string[]; messageRef?: string }
  | { op: "hold"; step: Stage; text: string }
  | { op: "remember"; group: string; text: string }
  | { op: "kit"; files: StoredFile[]; downloads: StoredFile[]; spec: unknown }
  | { op: "quoteChecked"; submissionId: string; passed: boolean };

export interface Store {
  /**
   * Opens the turn and reads the project. "busy" means another turn is
   * running. This is the one step that needs the person's sign-in; every
   * step after it runs on the turn itself.
   */
  begin(): Promise<Project | "busy">;
  /** Reads the project again inside the open turn, between Gala's steps. */
  read(): Promise<Project>;
  write(operations: Operation[]): Promise<void>;
  end(): Promise<void>;
  saveFile(bytes: Uint8Array, contentType: string): Promise<string>;
  /** With `maxBytes`, a larger file is refused with FileTooLarge before its bytes are read. */
  readFile(fileId: string, options?: { maxBytes?: number }): Promise<{ bytes: Uint8Array; contentType: string }>;
}

/** A file larger than the reader asked for; its bytes were not read. */
export class FileTooLarge extends Error {}
