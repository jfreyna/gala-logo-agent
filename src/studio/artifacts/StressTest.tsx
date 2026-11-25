import type { ReactNode } from "react";
import { CheckBadge } from "../../components/CheckBadge";
import type { StressTestArtifact } from "./types";
import { ArtifactCard, Turn } from "./Turn";

function Test({ label, pass, preview, previewClass }: { label: string; pass: boolean; preview: ReactNode; previewClass: string }) {
  return (
    <div className="relative flex w-[152px] shrink-0 flex-col items-start gap-[8px] desktop:w-[175px]" data-name={`test/${label}`}>
      <div className={`relative flex size-[152px] shrink-0 overflow-clip rounded-[12px] desktop:size-[175px] ${previewClass}`} data-name="preview">
        {preview}
      </div>
      <CheckBadge label={label} pass={pass} />
    </div>
  );
}

/**
 * gala-stress-test (Figma 5538:4676): the chosen mark against the real
 * world. At 16px (shown actual size and four times larger, so the judgment
 * is made on the enlarged render), in a circle, inverted, and on a poster.
 */
export function StressTest({ data }: { data: StressTestArtifact }) {
  const results = [data.checks.sixteen, data.checks.circle, data.checks.inverted, data.checks.poster];
  const passed = results.filter(Boolean).length;
  const mark = (className: string) => <img alt="" src={data.markUrl} className={`shrink-0 object-contain ${className}`} />;
  const caption = "type-mini-medium shrink-0 text-text-neutral-2-light";
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px]" data-name="gala-stress-test">
      <Turn>{data.say}</Turn>
      <ArtifactCard name="stress-test" gap={12}>
        <div className="relative flex w-full shrink-0 items-center justify-between" data-name="heading">
          <p className="type-body-semibold shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">Stress test</p>
          <p className="type-caption-medium shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">
            {passed} of {results.length} passed
          </p>
        </div>
        <div className="relative flex w-full shrink-0 flex-wrap items-start gap-[12px]" data-name="tests">
          <Test
            label="16px"
            pass={data.checks.sixteen}
            previewClass="items-end justify-center gap-[20px] bg-neutral-0 pb-[20px]"
            preview={
              <>
                <div className="relative flex shrink-0 flex-col items-center gap-[8px]" data-name="Actual">
                  {mark("size-[16px]")}
                  <p className={caption}>Actual</p>
                </div>
                <div className="relative flex shrink-0 flex-col items-center gap-[8px]" data-name="4×">
                  {mark("size-[64px]")}
                  <p className={caption}>4×</p>
                </div>
              </>
            }
          />
          <Test
            label="Circle"
            pass={data.checks.circle}
            previewClass="items-center justify-center bg-stroke-1-light dark:bg-stroke-1-dark"
            preview={
              <div className="relative flex size-[94px] shrink-0 items-center justify-center overflow-clip rounded-[999px] bg-neutral-0 desktop:size-[109px]" data-name="avatar">
                {mark("size-[61px] desktop:size-[70px]")}
              </div>
            }
          />
          <Test
            label="Inverted"
            pass={data.checks.inverted}
            previewClass="items-center justify-center bg-[#000000]"
            preview={mark("size-[84px] invert desktop:size-[96px]")}
          />
          <Test
            label="Poster"
            pass={data.checks.poster}
            previewClass="items-center justify-center bg-stroke-1-light dark:bg-stroke-1-dark"
            preview={
              <div className="relative flex h-[114px] w-[85px] shrink-0 flex-col items-center justify-center gap-[8px] bg-neutral-0 desktop:h-[131px] desktop:w-[98px]" data-name="poster">
                {mark("size-[49px] desktop:size-[56px]")}
                <p className="shrink-0 whitespace-nowrap font-headings text-[8px] font-bold uppercase leading-[normal] tracking-[0.12em] text-[#000000]">
                  {data.brandName}
                </p>
              </div>
            }
          />
        </div>
      </ArtifactCard>
    </div>
  );
}
