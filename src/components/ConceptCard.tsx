import { CheckBadge } from "./CheckBadge";
import { Icon } from "./Icon";

export type Check = { label: string; pass: boolean };

/**
 * gala-concept-card (Figma 5532:2882): one of Gala's three directions, or
 * one of three variations. The mark sits on white paper in both modes,
 * because the black-and-white phases are judged on white. Chosen: a purple
 * outline and a filled button, the one primary action.
 */
export function ConceptCard({
  letter,
  name,
  rationale,
  markUrl,
  checks,
  chosen = false,
  onChoose,
  className = "",
}: {
  letter: string;
  name: string;
  rationale: string;
  markUrl: string;
  checks: Check[];
  chosen?: boolean;
  /** Absent where the card is a picture of the work, not a choice. */
  onChoose?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`relative flex h-[438px] w-[248px] shrink-0 flex-col items-start gap-[12px] rounded-[16px] border-solid bg-background-1-light p-[12px] dark:bg-background-2-dark ${
        chosen
          ? "border-2 border-button-1-default-light dark:border-button-1-default-dark"
          : "border border-stroke-1-light dark:border-stroke-1-dark"
      } ${className}`}
      data-name="gala-concept-card"
    >
      <div className="relative flex h-[224px] w-full shrink-0 items-center justify-center overflow-clip rounded-[12px] bg-neutral-0" data-name="paper">
        <img alt={`Direction ${letter}: ${name}`} src={markUrl} className="size-[152px] shrink-0 object-contain" />
      </div>
      <div className="relative flex shrink-0 items-baseline gap-[8px] whitespace-nowrap" data-name="title">
        <p className="shrink-0 font-headings text-[20px] font-bold leading-[normal] text-headline-2-light dark:text-headline-2-dark">{letter}</p>
        <p className="type-body-semibold shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{name}</p>
      </div>
      <p className="type-caption-medium relative min-h-px w-full flex-[1_0_0] text-text-neutral-2-light [word-break:break-word] dark:text-text-neutral-2-dark">
        {rationale}
      </p>
      <div className="relative flex shrink-0 items-center gap-[12px]" data-name="checks">
        {checks.map((check) => (
          <CheckBadge key={check.label} label={check.label} pass={check.pass} />
        ))}
      </div>
      <button
        type="button"
        onClick={onChoose}
        tabIndex={onChoose ? 0 : -1}
        aria-pressed={chosen}
        className={`relative flex h-[40px] w-full shrink-0 items-center justify-center gap-[6px] rounded-[12px] ${
          chosen
            ? "bg-button-1-default-light text-button-light-text dark:bg-button-1-default-dark"
            : "border border-solid border-stroke-2-light text-text-neutral-1-light dark:border-stroke-2-dark dark:text-text-neutral-1-dark"
        }`}
        data-name="choose"
      >
        {chosen && <Icon name="check" size={16} />}
        <span className="type-caption-semibold shrink-0 whitespace-nowrap">{chosen ? "Chosen" : "Choose"}</span>
      </button>
    </div>
  );
}
