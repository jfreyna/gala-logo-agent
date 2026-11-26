import type { Check } from "../artifacts/types";
import type { RoleColor } from "./Colors";

/** One step of the work, as the History view lists it. */
export type Phase = {
  key: string;
  name: string;
  summary: string;
  status: "done" | "current" | "upcoming";
  /** Small marks under the summary of the current step, when it has drafts. */
  thumbs?: string[];
};

export type HistoryView = {
  view: "history";
  projectName: string;
  phases: Phase[];
  formats: string[];
  /** False until the kit exists; the format chips are dimmed until then. */
  kitReady: boolean;
  /** True while Gala works: "Back to this step" waits, and says so (Status=Done while working). */
  working?: boolean;
  /** Where each format's download stands (gala-download-chip). */
  downloads?: Record<string, "idle" | "saving" | "saved" | "couldnt">;
};

export type ArtifactView = {
  view: "artifact";
  heading: string;
  letter: string;
  name: string;
  rationale: string;
  markUrl: string;
  checks: Check[];
};

export type ColorView = { view: "color"; colors: RoleColor[] };

export type TypeFamily = { family: string; category: string; current: boolean };

export type TypeView = {
  view: "type";
  /** The card being changed: "A". */
  letter: string;
  brandName: string;
  replacing: string;
  categories: string[];
  selectedCategory: string;
  moods: string[];
  selectedMoods: string[];
  sortNote: string;
  families: TypeFamily[];
};

// The Kit view's shape lives with its builder, so the engine's check can import both (FRI-1730).
export type { KitView, PairBadge } from "./colorway";
import type { KitView } from "./colorway";

export type MemoryLine = { id: string; group: string; text: string };

export type MemoryView = {
  view: "memory";
  lines: MemoryLine[];
  /** Shows the clear-all confirmation from the start. Used by the dev preview only. */
  confirming?: boolean;
  /** The server's message for a memory action that failed, under the control it came from: a line's id, "add" or "clear". */
  errors?: Record<string, string>;
};

export type PanelView = HistoryView | ArtifactView | ColorView | TypeView | KitView | MemoryView;
