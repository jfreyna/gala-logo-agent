import type { Reference, ResearchArtifact } from "./types";
import { Turn } from "./Turn";
import defaultImage from "../../assets/icons/default-image.svg";

/**
 * gala-reference-card (Figma 5565:12011): one business from the audit, with
 * its mark on white paper, tagged Avoid (a competitor) or Borrow (a
 * neighbor), and one line on why.
 */
function ReferenceCard({ reference, kind }: { reference: Reference; kind: "avoid" | "borrow" }) {
  return (
    <div
      className="relative flex w-[237px] shrink-0 flex-col items-start gap-[8px] rounded-[16px] border border-solid border-stroke-1-light bg-background-1-light p-[12px] desktop:w-auto desktop:min-w-px desktop:flex-[1_0_0] dark:border-stroke-1-dark dark:bg-background-2-dark"
      data-name="gala-reference-card"
    >
      <div className="relative flex h-[96px] w-full shrink-0 items-center justify-center overflow-clip rounded-[8px] bg-neutral-0" data-name="image">
        {reference.imageUrl !== null ? (
          <img alt="" src={reference.imageUrl} className="max-h-full max-w-full object-contain" />
        ) : (
          <img alt="" src={defaultImage} width={32} height={32} className="size-[32px] shrink-0" />
        )}
      </div>
      <div className="relative flex w-full shrink-0 items-center justify-between gap-[8px]" data-name="meta">
        <p className="type-body-semibold min-w-px truncate text-text-neutral-1-light dark:text-text-neutral-1-dark">{reference.name}</p>
        <p
          className={`type-mini-semibold shrink-0 ${kind === "avoid" ? "text-error-text-light dark:text-error-text-dark" : "text-text-green-1-light dark:text-text-green-1-dark"}`}
        >
          {kind === "avoid" ? "Avoid" : "Borrow"}
        </p>
      </div>
      <p className="type-caption-medium w-full shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">{reference.note}</p>
    </div>
  );
}

function Group({ title, helper, references, kind }: { title: string; helper: string; references: Reference[]; kind: "avoid" | "borrow" }) {
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px]" data-name={`group/${title}`}>
      <div className="relative flex shrink-0 items-baseline gap-[8px]" data-name="label">
        <p className="type-caption-semibold shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{title}</p>
        <p className="type-mini-medium shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">{helper}</p>
      </div>
      <div className="swipe-row relative flex w-full shrink-0 items-start gap-[12px] overflow-x-auto desktop:overflow-visible" data-name="cards">
        {references.map((reference) => (
          <ReferenceCard key={reference.name} reference={reference} kind={kind} />
        ))}
      </div>
    </div>
  );
}

/** gala-research (Figma 5565:12308): competitors to avoid, neighbors to borrow from. */
export function Research({ data }: { data: ResearchArtifact }) {
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[16px]" data-name="gala-research">
      <Turn>{data.say}</Turn>
      <Group title="Competitors" helper="Marks to avoid copying" references={data.competitors} kind="avoid" />
      <Group title="Neighbors" helper="Good ideas from nearby businesses" references={data.neighbors} kind="borrow" />
    </div>
  );
}
