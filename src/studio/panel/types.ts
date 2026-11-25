import type { Check } from "../artifacts/types";
import type { Ladder, RoleColor } from "./Colors";

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

export type KitView = {
  view: "kit";
  brandName: string;
  clearSpace: { previewUrl: string; zoneColor: string; caption: string };
  minimumSizes: { item: string; value: string }[];
  type: { family: string; caption: string };
  ladders: Ladder[];
};

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
