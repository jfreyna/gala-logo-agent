import type { CSSProperties } from "react";
import { useGoogleFont } from "../../lib/googleFont";
import { linesOfName, TWO_LINE_TYPE } from "./nameLines";
import type { LockupArtifact, LockupLayout, LockupSpaceBetween } from "./types";
import { ArtifactCard, Turn } from "./Turn";
import { Actions, Field, Heading, Settings, Tile } from "./Settings";
import { CardFooter } from "../Feedback";
import type { Past } from "../history";

const LAYOUTS: [LockupLayout, string][] = [
  ["sideBySide", "Side by side"],
  ["stacked", "Stacked"],
];
const SPACES: [LockupSpaceBetween, string][] = [
  ["tight", "Tight"],
  ["asSet", "As set"],
  ["wide", "Wide"],
];

/** One drawing of the lockup: the mark's side, the name's size and the gap between them, on a phone and on desktop. */
type Drawing = { layout: LockupLayout; mark: [number, number]; type: [number, number]; gap: [number, number]; inverted?: boolean };

/**
 * The sizes the frames draw. The hero shows the selected layout; the first
 * tile shows the other one; "At 32px" and "Inverted" are side by side.
 */
const HERO: Record<LockupLayout, Drawing> = {
  sideBySide: { layout: "sideBySide", mark: [56, 96], type: [30, 52], gap: [14, 24] },
  // Not drawn in the file; sizes from the design review: mark 48 and name 26 on a phone, 80 and 44 on desktop, the gap 0.15 of the mark.
  stacked: { layout: "stacked", mark: [48, 80], type: [26, 44], gap: [7.2, 12] },
};
const OTHER: Record<LockupLayout, Drawing & { caption: string; height: string }> = {
  // Shown when the hero is side by side.
  sideBySide: { caption: "Stacked", height: "h-[100px] desktop:h-[96px]", layout: "stacked", mark: [40, 44], type: [18, 18], gap: [6, 7] },
  // Shown when the hero is stacked.
  stacked: { caption: "Side by side", height: "h-[64px] desktop:h-[96px]", layout: "sideBySide", mark: [32, 44], type: [18, 22], gap: [8, 10] },
};
const AT_32: Drawing = { layout: "sideBySide", mark: [32, 32], type: [18, 18], gap: [8, 8] };
const INVERTED: Drawing = { layout: "sideBySide", mark: [36, 40], type: [20, 22], gap: [9, 10], inverted: true };

/**
 * gala-lockup (Figma 5653:16465): the approved symbol and the approved
 * wordmark together. A hero in the selected layout; then the other layout,
 * the lockup at 32px, and inverted; Layout and Space between as chips; then
 * Change symbol (the same path as going back to the symbol) and Use this
 * lockup (the sign-off).
 *
 * Marks and names are content, so they are black on paper and white on
 * black, not tokens.
 */
export function Lockup({
  data,
  onSet,
  onChangeSymbol,
  onApprove,
  past,
  onBack,
}: {
  data: LockupArtifact;
  onSet: (setting: { layout?: LockupLayout; spaceBetween?: LockupSpaceBetween }) => void;
  onChangeSymbol: () => void;
  onApprove: () => void;
  past?: Past;
  onBack: () => void;
}) {
  useGoogleFont(data.family, data.brandName);
  // On two lines: left-aligned beside the symbol, centered under it, as the kit sets them.
  const lines = linesOfName(data.brandName, data);

  /** The symbol and the name, drawn at one of the frames' sizes. The sizes switch at the same width the layout does. */
  function draw(drawing: Drawing) {
    // A name on two lines is drawn at the kit's own ratio to the symbol (LOCKUP_RATIOS), so the block sits against the symbol as it does in the files.
    const type: [number, number] = lines.length > 1 ? [0, 1].map((at) => drawing.mark[at]! * TWO_LINE_TYPE[drawing.layout]) as [number, number] : drawing.type;
    const size = {
      "--mark": `${drawing.mark[0]}px`,
      "--mark-desktop": `${drawing.mark[1]}px`,
      "--type": `${type[0]}px`,
      "--type-desktop": `${type[1]}px`,
      "--gap": `${drawing.gap[0] * data.gapScale}px`,
      "--gap-desktop": `${drawing.gap[1] * data.gapScale}px`,
    } as CSSProperties;
    return (
      <div className={`relative flex shrink-0 items-center justify-center gap-[var(--gap)] desktop:gap-[var(--gap-desktop)] ${drawing.layout === "stacked" ? "flex-col" : ""}`} style={size} data-name={`lockup/${drawing.layout}`}>
        <img alt="" src={data.markUrl} className={`size-[var(--mark)] shrink-0 object-contain desktop:size-[var(--mark-desktop)] ${drawing.inverted ? "invert" : ""}`} data-name="mark" />
        <p
          className={`shrink-0 whitespace-nowrap text-[length:var(--type)] leading-[normal] desktop:text-[length:var(--type-desktop)] ${drawing.layout === "stacked" ? "text-center" : "text-left"} ${drawing.inverted ? "text-[#ffffff]" : "text-[#0d0d0d]"}`}
          style={{ fontFamily: `"${data.family}", serif`, letterSpacing: `${data.letterSpacingEm}em` }}
        >
          {lines.map((line, index) => (
            <span key={index} className="block">
              {line}
            </span>
          ))}
        </p>
      </div>
    );
  }

  const other = OTHER[data.layout];
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px]" data-name="gala-lockup">
      <Turn>{data.say}</Turn>
      <ArtifactCard name="lockup" gap={12}>
        <Heading title="Lockup" detail={`${data.markName} with ${data.brandName}`} />
        <div className="relative flex h-[120px] w-full shrink-0 items-center justify-center overflow-clip rounded-[12px] bg-neutral-0 desktop:h-[180px]" data-name="hero">
          {draw(HERO[data.layout])}
        </div>
        <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px] overflow-clip desktop:flex-row" data-name="sizes">
          <Tile caption={other.caption} className={other.height}>
            {draw(other)}
          </Tile>
          <Tile caption="At 32px" className="h-[64px] desktop:h-[96px]">
            {draw(AT_32)}
          </Tile>
          <Tile caption="Inverted" inverted className="h-[64px] desktop:h-[96px]">
            {draw(INVERTED)}
          </Tile>
        </div>
        {past !== undefined ? (
          <CardFooter past={past} onBack={onBack} />
        ) : (
          <>
            <Settings>
              <Field name="Layout" options={LAYOUTS} value={data.layout} disabled={data.approved} onPick={(value) => onSet({ layout: value })} />
              <Field name="Space between" options={SPACES} value={data.spaceBetween} disabled={data.approved} onPick={(value) => onSet({ spaceBetween: value })} />
            </Settings>
            <Actions change="Change symbol" approve="Use this lockup" disabled={data.approved} onChange={onChangeSymbol} onApprove={onApprove} />
          </>
        )}
      </ArtifactCard>
    </div>
  );
}
