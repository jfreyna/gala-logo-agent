import { CheckBadge } from "../../components/CheckBadge";
import { ColorChip } from "../../components/ColorChip";
import { contrastBadges, parseHex, valuesLine } from "../../lib/color";
import type { PickedColor } from "./colorway";

function Contrast({ hex, className = "" }: { hex: string; className?: string }) {
  const color = parseHex(hex);
  if (color === null) return null;
  return (
    <div className={`relative flex shrink-0 items-start gap-[12px] ${className}`} data-name="contrast">
      {contrastBadges(color).map((badge) => (
        <CheckBadge key={badge.label} label={badge.label} pass={badge.pass} />
      ))}
    </div>
  );
}

export type RoleColor = { role: string; use: string; hex: string };

/**
 * gala-color-summary (Figma 5545:7163): one swatch per role with what it is
 * for and its contrast on white and on black. No ladders before the kit.
 */
export function ColorSummary({ colors }: { colors: RoleColor[] }) {
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[20px]" data-name="gala-color-summary">
      {colors.map((color) => (
        <div key={color.role} className="relative flex w-full shrink-0 items-start gap-[12px]" data-name={`color/${color.role}`}>
          <span className="block h-[36px] w-[48px] shrink-0 rounded-[4px] border border-solid border-neutral-500" style={{ backgroundColor: color.hex }} data-name="swatch" />
          <div className="relative flex min-w-px flex-[1_0_0] flex-col items-start gap-[4px]" data-name="texts">
            <p className="type-body-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">{color.role}</p>
            <p className="type-caption-medium shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{color.use}</p>
            <Contrast hex={color.hex} className="pt-[4px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export type { PickedColor } from "./colorway";

/**
 * gala-palette (Figma 5540:5478, FRI-1730 frame 5689:19050): the kit's
 * colors. Each brand color first as picked, a 64px swatch with its role and
 * what it does in this colorway, then its hex, RGB and CMYK values and its
 * contrast. Its ladder follows, labelled "Tints and shades", with no chip
 * marked as the base: the picked color is never a ladder step (FRI-1603).
 * The CMYK note says the values are a reference.
 */
export function Palette({ colors }: { colors: PickedColor[] }) {
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[20px]" data-name="gala-palette">
      {colors.map((color) => {
        const picked = parseHex(color.hex);
        return (
          <div key={color.role} className="relative flex w-full shrink-0 flex-col items-start gap-[8px]" data-name={`color/${color.role}`}>
            <div className="relative flex w-full shrink-0 items-center gap-[12px]" data-name="picked">
              <span className="block size-[64px] shrink-0 rounded-[12px] border border-solid border-neutral-500" style={{ backgroundColor: color.hex }} data-name="swatch" />
              <div className="relative flex min-w-px flex-[1_0_0] flex-col items-start gap-[4px]" data-name="texts">
                <p className="type-body-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">{color.role}</p>
                <p className="type-caption-medium w-full shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{color.use}</p>
              </div>
            </div>
            {picked !== null && (
              <p className="type-mini-semibold w-full shrink-0 whitespace-pre-wrap text-text-neutral-1-light dark:text-text-neutral-1-dark" data-name="values">{valuesLine(picked)}</p>
            )}
            {/* The kit's own contrast labels, the same rounding as the Colorway badges and Gala's facts. */}
            <div className="relative flex shrink-0 items-start gap-[12px]" data-name="contrast">
              {color.contrast.map((badge) => (
                <CheckBadge key={badge.label} label={badge.label} pass={badge.pass} />
              ))}
            </div>
            <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px]" data-name="gala-color-ladder">
              <p className="type-caption-semibold shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">Tints and shades</p>
              <div className="relative flex w-full shrink-0 flex-wrap items-start gap-x-[30px] gap-y-[4px]" data-name="steps">
                {color.steps.map((step) => (
                  <ColorChip key={step.step} color={step.hex} label={step.hex.toUpperCase()} shape="circle" />
                ))}
              </div>
            </div>
          </div>
        );
      })}
      <p className="type-mini-medium w-full shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">
        CMYK values are a straight conversion, for reference. Confirm them with your printer before a print run.
      </p>
    </div>
  );
}
