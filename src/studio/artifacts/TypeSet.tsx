import { Icon } from "../../components/Icon";
import { useGoogleFont } from "../../lib/googleFont";
import type { TypeDirection, TypeSetArtifact } from "./types";
import { Turn } from "./Turn";

const ALPHABET = "Aa Bb Cc 0123";

/**
 * gala-type-specimen (Figma 5547:6915): one type direction. The brand name
 * set in the family on white paper, the family, Google's category and mood
 * tags, a reason, and two actions: Change (opens the type tray for this card
 * only) and Choose.
 */
function TypeSpecimen({
  direction,
  brandName,
  chosen,
  onChange,
  onChoose,
}: {
  direction: TypeDirection;
  brandName: string;
  chosen: boolean;
  onChange: () => void;
  onChoose: () => void;
}) {
  useGoogleFont(direction.family, brandName + ALPHABET);
  const fontFamily = `"${direction.family}", serif`;
  return (
    <div
      className={`relative flex w-[248px] shrink-0 flex-col items-start gap-[12px] self-stretch rounded-[16px] border-solid bg-background-1-light p-[12px] desktop:w-auto desktop:min-w-px desktop:flex-[1_0_0] dark:bg-background-2-dark ${
        chosen
          ? "border-2 border-button-1-default-light dark:border-button-1-default-dark"
          : "border border-stroke-1-light dark:border-stroke-1-dark"
      }`}
      data-name="gala-type-specimen"
    >
      <div className="relative flex h-[132px] w-full shrink-0 flex-col items-center justify-center gap-[8px] overflow-clip rounded-[12px] bg-neutral-0" data-name="paper">
        <p className="max-w-full shrink-0 truncate text-[30px] leading-[normal] text-[#000000]" style={{ fontFamily }}>
          {brandName}
        </p>
        <p className="shrink-0 text-[14px] leading-[normal] text-[rgba(0,0,0,0.55)]" style={{ fontFamily }}>
          {ALPHABET}
        </p>
      </div>
      <div className="relative flex w-full shrink-0 items-center justify-between gap-[8px]" data-name="head">
        <p className="type-body-semibold min-w-px truncate text-text-neutral-1-light dark:text-text-neutral-1-dark">{direction.family}</p>
        {direction.pick !== null && (
          <span className="relative flex shrink-0 items-start rounded-[999px] bg-background-3-light px-[8px] py-[2px] dark:bg-background-3-dark" data-name="pick">
            <span className="type-mini-semibold shrink-0 whitespace-nowrap text-text-neutral-1-light dark:text-text-neutral-1-dark">
              {direction.pick === "gala" ? "My pick" : "Your pick"}
            </span>
          </span>
        )}
      </div>
      <div className="relative flex shrink-0 flex-col items-start gap-[4px]" data-name="meta">
        <p className="type-mini-semibold shrink-0 text-headline-1-light dark:text-headline-1-dark">{direction.category}</p>
        <p className="type-mini-medium shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">{direction.moods}</p>
      </div>
      <p className="type-caption-medium relative w-full flex-[1_0_auto] text-text-neutral-2-light dark:text-text-neutral-2-dark">{direction.rationale}</p>
      <div className="relative flex w-full shrink-0 items-start gap-[8px]" data-name="actions">
        <button
          type="button"
          onClick={onChange}
          className="relative flex h-[40px] min-w-px flex-[1_0_0] items-center justify-center rounded-[12px] border border-solid border-stroke-2-light dark:border-stroke-2-dark"
          data-name="change"
        >
          <span className="type-caption-semibold shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">Change</span>
        </button>
        <button
          type="button"
          onClick={onChoose}
          aria-pressed={chosen}
          className={`relative flex h-[40px] min-w-px flex-[1_0_0] items-center justify-center gap-[6px] rounded-[12px] ${
            chosen
              ? "bg-button-1-default-light text-button-light-text dark:bg-button-1-default-dark"
              : "border border-solid border-stroke-2-light text-text-neutral-1-light dark:border-stroke-2-dark dark:text-text-neutral-1-dark"
          }`}
          data-name="choose"
        >
          {chosen && <Icon name="check" size={16} />}
          <span className="type-caption-semibold shrink-0">{chosen ? "Chosen" : "Choose"}</span>
        </button>
      </div>
    </div>
  );
}

/** The saved choice: the brand name in the chosen family, with Edit. */
function SavedType({ direction, brandName, onEdit }: { direction: TypeDirection; brandName: string; onEdit: () => void }) {
  useGoogleFont(direction.family, brandName);
  return (
    <div
      className="relative flex w-full shrink-0 items-center justify-between gap-[16px] rounded-[16px] bg-background-1-light p-[16px] dark:bg-background-2-dark"
      data-name="saved"
    >
      <div className="relative flex min-w-px flex-wrap items-center gap-[16px]" data-name="chosen">
        <div className="relative flex shrink-0 items-center justify-center rounded-[8px] bg-neutral-0 px-[16px] py-[10px]" data-name="paper">
          <p className="shrink-0 whitespace-nowrap text-[24px] leading-[normal] text-[#000000]" style={{ fontFamily: `"${direction.family}", serif` }}>
            {brandName}
          </p>
        </div>
        <div className="relative flex shrink-0 flex-col items-start gap-[4px]" data-name="meta">
          <p className="type-body-semibold shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{direction.family}</p>
          <p className="type-mini-semibold shrink-0 text-headline-1-light dark:text-headline-1-dark">{direction.category}</p>
        </div>
      </div>
      <button type="button" onClick={onEdit} className="type-caption-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">
        Edit
      </button>
    </div>
  );
}

/**
 * gala-type-set (Figma 5547:7164). Choosing: three type directions. Saved:
 * the choice collapsed to the brand name set in the chosen family.
 */
export function TypeSet({
  data,
  onChange,
  onChoose,
  onEdit,
}: {
  data: TypeSetArtifact;
  onChange: (id: string) => void;
  onChoose: (id: string) => void;
  onEdit: () => void;
}) {
  const saved = data.saved ? data.directions.find((direction) => direction.id === data.chosenId) : undefined;
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px]" data-name="gala-type-set">
      <Turn>{data.say}</Turn>
      {saved ? (
        <SavedType direction={saved} brandName={data.brandName} onEdit={onEdit} />
      ) : (
        <div className="swipe-row relative flex w-full shrink-0 items-stretch gap-[12px] overflow-x-auto desktop:overflow-visible" data-name="directions">
          {data.directions.map((direction) => (
            <TypeSpecimen
              key={direction.id}
              direction={direction}
              brandName={data.brandName}
              chosen={direction.id === data.chosenId}
              onChange={() => onChange(direction.id)}
              onChoose={() => onChoose(direction.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
