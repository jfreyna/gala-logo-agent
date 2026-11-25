import { CheckBadge } from "../../components/CheckBadge";
import { ColorChip } from "../../components/ColorChip";
import { contrastBadges, parseHex, valuesLine } from "../../lib/color";

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
            <p className="type-body-semibold shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{color.role}</p>
            <p className="type-caption-medium shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">{color.use}</p>
            <Contrast hex={color.hex} className="pt-[4px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export type Ladder = { role: string; base: string; steps: { step: number; hex: string }[] };

/**
 * gala-palette (Figma 5540:5478): the kit's colors. Each brand color with
 * its full ladder, 50 to 900, in circle chips; its hex, RGB and CMYK values;
 * and its contrast. The CMYK note says the values are a reference.
 */
export function Palette({ ladders }: { ladders: Ladder[] }) {
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[20px]" data-name="gala-palette">
      {ladders.map((ladder) => {
        const base = parseHex(ladder.base);
        return (
          <div key={ladder.role} className="relative flex w-full shrink-0 flex-col items-start gap-[8px]" data-name={`color/${ladder.role}`}>
            <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px]" data-name="gala-color-ladder">
              <p className="type-caption-semibold shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{ladder.role}</p>
              <div className="relative flex w-full shrink-0 flex-wrap items-start gap-x-[30px] gap-y-[4px]" data-name="steps">
                {ladder.steps.map((step) => (
                  <ColorChip
                    key={step.step}
                    color={step.hex}
                    label={step.hex.toUpperCase()}
                    shape="circle"
                    base={step.hex.toUpperCase() === ladder.base.toUpperCase()}
                  />
                ))}
              </div>
            </div>
            {base !== null && (
              <p className="type-mini-semibold w-full shrink-0 whitespace-pre-wrap text-text-neutral-1-light dark:text-text-neutral-1-dark">{valuesLine(base)}</p>
            )}
            <Contrast hex={ladder.base} />
          </div>
        );
      })}
      <p className="type-mini-medium w-full shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">
        CMYK values are a straight conversion, for reference. Confirm them with your printer before a print run.
      </p>
    </div>
  );
}
