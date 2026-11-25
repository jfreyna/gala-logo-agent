import { useGoogleFont } from "../../lib/googleFont";
import type { WordmarkArtifact, WordmarkCase, WordmarkSpacing } from "./types";
import { ArtifactCard, Turn } from "./Turn";
import { Actions, Field, Heading, Settings, Tile } from "./Settings";
import { CardFooter } from "../Feedback";
import type { Past } from "../history";
import { weightName } from "../weights";

const CASES: [WordmarkCase, string][] = [
  ["asTyped", "As typed"],
  ["allCaps", "ALL CAPS"],
  ["lowercase", "lowercase"],
];
const SPACINGS: [WordmarkSpacing, string][] = [
  ["tight", "Tight"],
  ["asDrawn", "As drawn"],
  ["wide", "Wide"],
];

/**
 * gala-wordmark (Figma 5648:15971): the name set in the chosen typeface on
 * its own, before any symbol. A hero at display size; the name at 32px, at
 * 16px and inverted; Case and Spacing as chips; then Change typeface (the
 * same path as going back to Type) and Use this wordmark (the sign-off).
 *
 * The name is content, so it is set in near-black on paper, and in white
 * on black when inverted, not in tokens.
 */
export function Wordmark({
  data,
  onSet,
  onChangeTypeface,
  onApprove,
  past,
  onBack,
}: {
  data: WordmarkArtifact;
  onSet: (setting: { case?: WordmarkCase; spacing?: WordmarkSpacing }) => void;
  onChangeTypeface: () => void;
  onApprove: () => void;
  past?: Past;
  onBack: () => void;
}) {
  useGoogleFont(data.family, data.brandName);
  // The weight the kit drew the name in (FRI-1711): a family with no Regular is set in the weight a browser picks for it.
  const weight = data.weight ?? 400;
  const type = { fontFamily: `"${data.family}", serif`, fontWeight: weight, letterSpacing: `${data.letterSpacingEm}em` };
  const name = (className: string) => (
    <p className={`shrink-0 whitespace-nowrap leading-[normal] ${className}`} style={type}>
      {data.brandName}
    </p>
  );
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px]" data-name="gala-wordmark">
      <Turn>{data.say}</Turn>
      <ArtifactCard name="wordmark" gap={12}>
        <Heading title="Wordmark" detail={`${data.family} · ${weightName(weight)}`} />
        <div className="relative flex h-[120px] w-full shrink-0 flex-col items-center justify-center overflow-clip rounded-[12px] bg-neutral-0 desktop:h-[180px]" data-name="hero">
          {name("text-[40px] text-[#0d0d0d] desktop:text-[72px]")}
        </div>
        <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px] overflow-clip desktop:flex-row" data-name="sizes">
          <Tile caption="At 32px" className="h-[64px] desktop:h-[96px]">
            {name("text-[32px] text-[#0d0d0d]")}
          </Tile>
          <Tile caption="At 16px" className="h-[64px] desktop:h-[96px]">
            {name("text-[16px] text-[#0d0d0d]")}
          </Tile>
          <Tile caption="Inverted" inverted className="h-[64px] desktop:h-[96px]">
            {name("text-[32px] text-[#ffffff]")}
          </Tile>
        </div>
        {past !== undefined ? (
          <CardFooter past={past} onBack={onBack} />
        ) : (
          <>
            <Settings>
              <Field name="Case" options={CASES} value={data.case} disabled={data.approved} onPick={(value) => onSet({ case: value })} />
              <Field name="Spacing" options={SPACINGS} value={data.spacing} disabled={data.approved} onPick={(value) => onSet({ spacing: value })} />
            </Settings>
            <Actions change="Change typeface" approve="Use this wordmark" disabled={data.approved} onChange={onChangeTypeface} onApprove={onApprove} />
          </>
        )}
      </ArtifactCard>
    </div>
  );
}
