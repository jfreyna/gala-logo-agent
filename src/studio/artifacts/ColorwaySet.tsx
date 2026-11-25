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
 * application of the person's own colors. Roles are named, never hex.
 */
function ColorwayCard({
  colorway,
  brandName,
  family,
  colors,
  chosen,
  onChoose,
}: {
  colorway: Colorway;
  brandName: string;
  family: string;
  colors: BrandColors;
  chosen: boolean;
  onChoose: () => void;
}) {
  return (
    <div
      className={`relative flex h-[478px] w-[248px] shrink-0 flex-col items-start gap-[12px] rounded-[16px] border-solid bg-background-1-light p-[12px] desktop:w-auto desktop:min-w-px desktop:flex-[1_0_0] dark:bg-background-2-dark ${
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
        <img alt={`Colorway ${colorway.letter}: ${colorway.name}`} src={colorway.markUrl} className="size-[120px] shrink-0 object-contain" />
        <p className="shrink-0 whitespace-nowrap text-[18px] leading-[normal]" style={{ color: colorway.wordmarkColor, fontFamily: `"${family}", serif` }}>
          {brandName}
        </p>
      </div>
      <div className="relative flex shrink-0 items-baseline gap-[8px] whitespace-nowrap" data-name="title">
        <p className="shrink-0 font-headings text-[20px] font-bold leading-[normal] text-headline-2-light dark:text-headline-2-dark">{colorway.letter}</p>
        <p className="type-body-semibold shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{colorway.name}</p>
      </div>
      <p className="type-caption-medium relative min-h-px w-full flex-[1_0_0] text-text-neutral-2-light dark:text-text-neutral-2-dark">{colorway.rationale}</p>
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
      <div className="swipe-row relative flex w-full shrink-0 items-start gap-[12px] overflow-x-auto desktop:overflow-visible" data-name="colorways">
        {data.colorways.map((colorway) => (
          <ColorwayCard
            key={colorway.id}
            colorway={colorway}
            brandName={data.brandName}
            family={data.family}
            colors={data.colors}
            chosen={colorway.id === data.chosenId}
            onChoose={() => onChoose(colorway.id)}
          />
        ))}
      </div>
    </div>
  );
}
