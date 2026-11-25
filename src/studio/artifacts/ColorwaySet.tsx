import { ColorChip } from "../../components/ColorChip";
import { Icon } from "../../components/Icon";
import { useGoogleFont } from "../../lib/googleFont";
import type { BrandColors, Colorway, ColorwaySetArtifact, Role } from "./types";
import { Turn } from "./Turn";

function roleColor(role: Role, colors: BrandColors): string {
  if (role === "Primary") return colors.primary;
  if (role === "Secondary") return colors.secondary;
  return colors.tertiary ?? colors.primary;
}

/**
 * gala-colorway-card (Figma 5541:5428): the chosen mark and name in one
 * application of the person's own colors. Roles are named, never hex. With
 * the card's Mark property off, for a logo of the name alone, the paper
 * shows the wordmark by itself.
 */
function ColorwayCard({
  colorway,
  brandName,
  family,
  letterSpacingEm,
  colors,
  chosen,
  onChoose,
}: {
  colorway: Colorway;
  brandName: string;
  family: string;
  letterSpacingEm: number;
  colors: BrandColors;
  chosen: boolean;
  onChoose: () => void;
}) {
  return (
    <div
      className={`relative flex w-[248px] shrink-0 flex-col items-start gap-[12px] rounded-[16px] border-solid bg-background-1-light p-[12px] desktop:w-auto desktop:min-w-px desktop:flex-[1_0_0] dark:bg-background-2-dark ${
        chosen
          ? "border-2 border-button-1-default-light dark:border-button-1-default-dark"
          : "border border-stroke-1-light dark:border-stroke-1-dark"
      }`}
      data-name="gala-colorway-card"
    >
      <div
        className="relative flex h-[224px] w-full shrink-0 flex-col items-center justify-center gap-[10px] overflow-clip rounded-[12px]"
        style={{ backgroundColor: colorway.ground }}
        data-name="paper"
      >
        {colorway.markUrl !== undefined && <img alt={`Colorway ${colorway.letter}: ${colorway.name}`} src={colorway.markUrl} className="size-[120px] shrink-0 object-contain" />}
        {/* Mark off (a logo of the name alone): the paper shows the wordmark alone at 30px. */}
        <p
          className={`max-w-full shrink-0 whitespace-nowrap leading-[normal] ${colorway.markUrl !== undefined ? "text-[18px]" : "text-[30px]"}`}
          style={{ color: colorway.wordmarkColor, fontFamily: `"${family}", serif`, letterSpacing: `${letterSpacingEm}em` }}
        >
          {brandName}
        </p>
      </div>
      <div className="relative flex shrink-0 items-baseline gap-[8px] whitespace-nowrap" data-name="title">
        <p className="shrink-0 font-headings text-[20px] font-bold leading-[normal] text-headline-2-light dark:text-headline-2-dark">{colorway.letter}</p>
        <p className="type-body-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">{colorway.name}</p>
      </div>
      <p className="type-caption-medium relative w-full flex-[1_0_auto] text-text-neutral-1-light dark:text-text-neutral-1-dark">{colorway.rationale}</p>
      <div className="relative flex shrink-0 items-start gap-[4px]" data-name="swatches">
        {colorway.roles.map((role) => (
          <ColorChip key={role} color={roleColor(role, colors)} label={role} />
        ))}
      </div>
      <button
        type="button"
        onClick={onChoose}
        aria-pressed={chosen}
        className={`relative flex h-[40px] w-full shrink-0 items-center justify-center gap-[6px] rounded-[12px] ${
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
  );
}

/** gala-colorway-set (Figma 5541:5713): the person's colors applied three ways. */
export function ColorwaySet({ data, onChoose }: { data: ColorwaySetArtifact; onChoose: (id: string) => void }) {
  useGoogleFont(data.family, data.brandName);
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px]" data-name="gala-colorway-set">
      <Turn>{data.say}</Turn>
      <div className="swipe-row relative flex w-full shrink-0 items-stretch gap-[12px] overflow-x-auto desktop:overflow-visible" data-name="colorways">
        {data.colorways.map((colorway) => (
          <ColorwayCard
            key={colorway.id}
            colorway={colorway}
            brandName={data.brandName}
            family={data.family}
            letterSpacingEm={data.letterSpacingEm ?? 0}
            colors={data.colors}
            chosen={colorway.id === data.chosenId}
            onChoose={() => onChoose(colorway.id)}
          />
        ))}
      </div>
    </div>
  );
}
