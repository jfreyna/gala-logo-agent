import { Link } from "../lib/router";
import dotDone from "../assets/icons/dot-done.svg";
import dotInProgress from "../assets/icons/dot-in-progress.svg";
import dotNotStarted from "../assets/icons/dot-not-started.svg";

export type ProjectStatus = "done" | "inProgress" | "notStarted";

const DOT: Record<ProjectStatus, string> = { done: dotDone, inProgress: dotInProgress, notStarted: dotNotStarted };

/**
 * gala-project-card (Figma 5562:11737): one logo project. The latest mark on
 * white paper (or "No drafts yet"), the brand, the stage with a status dot,
 * and when it was last touched. Opening it returns to that project's studio.
 */
export function ProjectCard({
  to,
  brandName,
  stageLabel,
  status,
  updatedLabel,
  markUrl,
}: {
  to: string;
  brandName: string;
  stageLabel: string;
  status: ProjectStatus;
  updatedLabel: string;
  markUrl: string | null;
}) {
  return (
    <Link
      to={to}
      className="relative flex w-full shrink-0 flex-col items-start gap-[12px] rounded-[16px] border border-solid border-stroke-1-light bg-background-1-light p-[12px] desktop:w-[320px] dark:border-stroke-1-dark dark:bg-background-2-dark"
    >
      {markUrl !== null ? (
        <div className="relative flex h-[168px] w-full shrink-0 items-center justify-center overflow-clip rounded-[12px] bg-neutral-0" data-name="art">
          <img alt="" src={markUrl} className="size-[104px] shrink-0 object-contain" />
        </div>
      ) : (
        <div
          className="relative flex h-[168px] w-full shrink-0 items-center justify-center overflow-clip rounded-[12px] border border-dashed border-stroke-2-light bg-neutral-0 dark:border-stroke-2-dark"
          data-name="art"
        >
          <p className="type-caption-medium shrink-0 whitespace-nowrap text-text-neutral-2-light">No drafts yet</p>
        </div>
      )}
      <div className="relative flex w-full shrink-0 flex-col items-start gap-[4px] overflow-clip" data-name="meta">
        <p className="type-body-semibold shrink-0 whitespace-nowrap text-text-neutral-1-light dark:text-text-neutral-1-dark">{brandName}</p>
        <div className="relative flex shrink-0 items-center gap-[6px] overflow-clip" data-name="stage">
          <img alt="" src={DOT[status]} width={8} height={8} className="size-[8px] shrink-0" />
          <p className="type-caption-medium shrink-0 whitespace-nowrap text-text-neutral-1-light dark:text-text-neutral-1-dark">{stageLabel}</p>
        </div>
        <p className="type-mini-medium shrink-0 whitespace-nowrap text-text-neutral-2-light dark:text-text-neutral-2-dark">{updatedLabel}</p>
      </div>
    </Link>
  );
}
