import { Icon } from "../../components/Icon";
import type { KitArtifact } from "./types";
import { ArtifactCard, Turn } from "./Turn";

/**
 * gala-kit (Figma 5551:8131): the finished lock-up kit. Six lock-ups on
 * paper, the kinds of file in the kit, the spec sheet link, and Download kit.
 */
export function Kit({
  data,
  onDownloadFormat,
  onDownloadKit,
  onOpenSpec,
}: {
  data: KitArtifact;
  onDownloadFormat: (format: string) => void;
  onDownloadKit: () => void;
  onOpenSpec: () => void;
}) {
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px]" data-name="gala-kit">
      <Turn>{data.say}</Turn>
      <ArtifactCard name="kit">
        <div className="relative flex w-full shrink-0 items-center justify-between" data-name="heading">
          <p className="type-body-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">Lock-up kit</p>
          <div className="relative flex shrink-0 items-center gap-[4px]" data-name="saved">
            <Icon name="check" className="text-text-green-1-light dark:text-text-green-1-dark" />
            <p className="type-mini-semibold shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">Saved to your projects</p>
          </div>
        </div>
        <div className="relative flex w-full shrink-0 flex-wrap items-start gap-[12px]" data-name="lockups">
          {data.lockups.map((lockup) => (
            <div
              key={lockup.label}
              className="relative flex w-[calc((100%-12px)/2)] shrink-0 flex-col items-start gap-[8px] desktop:w-[calc((100%-24px)/3)]"
              data-name={`lockup/${lockup.label}`}
            >
              <div
                className={`relative flex h-[110px] w-full shrink-0 items-center justify-center overflow-clip rounded-[12px] desktop:h-[140px] ${lockup.ground === "black" ? "bg-[#000000]" : "bg-neutral-0"}`}
                data-name="paper"
              >
                <img alt={`${lockup.label} lock-up`} src={lockup.previewUrl} className="max-h-[46px] max-w-[86%] object-contain desktop:max-h-[72px]" />
              </div>
              <p className="type-caption-medium shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">{lockup.label}</p>
            </div>
          ))}
        </div>
        <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px] desktop:flex-row desktop:items-center desktop:justify-between" data-name="downloads">
          <div className="relative flex shrink-0 flex-wrap items-start gap-[8px]" data-name="formats">
            {data.formats.map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => onDownloadFormat(format)}
                className="relative flex shrink-0 items-center justify-center rounded-[8px] border border-solid border-stroke-2-light px-[12px] py-[8px] dark:border-stroke-2-dark"
                data-name="format"
              >
                <span className="type-caption-semibold shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{format}</span>
              </button>
            ))}
          </div>
          <div className="relative flex w-full shrink-0 items-center justify-between gap-[16px] desktop:w-auto desktop:justify-start" data-name="actions">
            <button type="button" onClick={onOpenSpec} className="type-caption-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">
              Spec sheet ›
            </button>
            <button
              type="button"
              onClick={onDownloadKit}
              className="relative flex h-[40px] shrink-0 items-center justify-center gap-[6px] rounded-[12px] bg-button-1-default-light px-[16px] text-button-light-text dark:bg-button-1-default-dark"
              data-name="download"
            >
              <Icon name="download" />
              <span className="type-caption-semibold shrink-0">Download kit</span>
            </button>
          </div>
        </div>
      </ArtifactCard>
    </div>
  );
}
