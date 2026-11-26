import type { ProjectStatus } from "../components/ProjectCard";

/**
 * Where a project stands, as the project card says it. The labels are the
 * ones the Projects frame shows.
 */
export type Stage =
  | "brief"
  | "research"
  | "type"
  | "wordmark"
  | "symbolOpener"
  | "directions"
  | "variations"
  | "stressTest"
  | "lockup"
  | "pickColors"
  | "colorways"
  | "kit"
  | "picks"
  | "done";

/**
 * The line a project card shows for each stage. The frames give five of
 * these; the rest are the same steps as the frames' section labels name
 * them, and the wordmark, the symbol and the lockup as the
 * design review named them.
 */
export const STAGE_LABEL: Record<Stage, string> = {
  brief: "Brief started",
  research: "Research and direction",
  type: "Type",
  wordmark: "Wordmark",
  symbolOpener: "Symbol",
  directions: "Three directions",
  variations: "Three variations",
  stressTest: "Stress test",
  lockup: "Lockup",
  pickColors: "Choosing colors",
  colorways: "Choosing colors",
  kit: "Kit ready",
  picks: "Kit ready",
  done: "Kit ready",
};

export function stageStatus(stage: Stage): ProjectStatus {
  if (stage === "brief") return "notStarted";
  if (stage === "kit" || stage === "picks" || stage === "done") return "done";
  return "inProgress";
}

/** "Updated today", "Updated yesterday", then the date ("Updated Nov 23"). */
export function updatedLabel(updatedAt: number, now: number = Date.now()): string {
  const day = (time: number) => {
    const date = new Date(time);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  };
  const days = Math.round((day(now) - day(updatedAt)) / 86_400_000);
  if (days <= 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  return `Updated ${new Date(updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** What a project is called before its brief gives it a name. */
export const UNNAMED_PROJECT = "New logo";

export function projectName(brandName: string): string {
  return brandName.trim().length > 0 ? brandName : UNNAMED_PROJECT;
}
