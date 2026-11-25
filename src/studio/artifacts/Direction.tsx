import type { ReactNode } from "react";
import type { DirectionArtifact } from "./types";
import { ArtifactCard, Chip, FieldLabel, Turn } from "./Turn";

function Row({ label, center = false, children }: { label: string; center?: boolean; children: ReactNode }) {
  return (
    <div
      className={`relative flex w-full shrink-0 flex-col items-start gap-[4px] desktop:flex-row desktop:gap-[16px] ${center ? "desktop:items-center" : "desktop:items-baseline"}`}
      data-name={`row/${label}`}
    >
      <FieldLabel className="desktop:w-[96px]">{label}</FieldLabel>
      {children}
    </div>
  );
}

/**
 * gala-direction (Figma 5565:12433): the creative direction, stated before
 * anything is drawn, with the two answers: change something, or looks right.
 */
export function Direction({ data, onChange, onApprove }: { data: DirectionArtifact; onChange: () => void; onApprove: () => void }) {
  const value = "type-body-regular w-full shrink-0 text-text-neutral-1-light desktop:min-w-px desktop:flex-[1_0_0] dark:text-text-neutral-1-dark";
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px]" data-name="gala-direction">
      <Turn>{data.say}</Turn>
      <ArtifactCard name="direction">
        <p className="type-body-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">Direction</p>
        <Row label="Mood">
          <p className={value}>{data.mood}</p>
        </Row>
        <Row label="Posture">
          <p className={value}>{data.posture}</p>
        </Row>
        <Row label="Energy">
          <p className={value}>{data.energy}</p>
        </Row>
        <Row label="References" center>
          <div className="relative flex w-full shrink-0 flex-wrap items-start gap-[6px] desktop:min-w-px desktop:flex-[1_0_0]" data-name="chips">
            {data.references.map((reference) => (
              <Chip key={reference}>{reference}</Chip>
            ))}
          </div>
        </Row>
        <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px] desktop:flex-row desktop:justify-end desktop:gap-[12px]" data-name="actions">
          <button
            type="button"
            onClick={onApprove}
            className="relative flex h-[40px] w-full shrink-0 items-center justify-center rounded-[12px] bg-button-1-default-light px-[20px] desktop:order-2 desktop:w-auto dark:bg-button-1-default-dark"
            data-name="looks-right"
          >
            <span className="type-caption-semibold shrink-0 text-button-light-text">Looks right</span>
          </button>
          <button
            type="button"
            onClick={onChange}
            className="relative flex h-[40px] w-full shrink-0 items-center justify-center rounded-[12px] border border-solid border-stroke-2-light px-[16px] desktop:order-1 desktop:w-auto dark:border-stroke-2-dark"
            data-name="change"
          >
            <span className="type-caption-semibold shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">Change something</span>
          </button>
        </div>
      </ArtifactCard>
    </div>
  );
}
