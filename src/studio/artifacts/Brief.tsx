import type { ReactNode } from "react";
import type { BriefArtifact } from "./types";
import { ArtifactCard, Chip, FieldLabel, Turn } from "./Turn";

function Field({ label, pending, children }: { label: string; pending: boolean; children: ReactNode }) {
  return (
    <div
      className={`relative flex w-full shrink-0 flex-col items-start gap-[6px] desktop:w-[calc(50%-12px)] ${pending ? "opacity-70" : ""}`}
      data-name={`field/${label}`}
    >
      <FieldLabel>{label}</FieldLabel>
      {pending ? <p className="type-caption-medium shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">I’ll ask</p> : children}
    </div>
  );
}

function Value({ children }: { children: string | null }) {
  if (children === null) {
    return <p className="type-body-regular w-full shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">None yet</p>;
  }
  return <p className="type-body-regular w-full shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{children}</p>;
}

/**
 * gala-brief (Figma 5564:12227): the brief as it fills in. A field Gala has
 * not asked about yet is dimmed and says "I’ll ask".
 */
export function Brief({ data, onEdit }: { data: BriefArtifact; onEdit: () => void }) {
  const pending = (field: BriefArtifact["pending"][number]) => data.pending.includes(field);
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px]" data-name="gala-brief">
      <Turn>{data.say}</Turn>
      <ArtifactCard name="brief">
        <div className="relative flex w-full shrink-0 items-center justify-between" data-name="heading">
          <p className="type-body-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">Brief</p>
          <button type="button" onClick={onEdit} className="type-caption-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">
            Edit
          </button>
        </div>
        <div className="relative flex w-full shrink-0 flex-wrap items-start gap-x-[24px] gap-y-[16px]" data-name="fields">
          <Field label="Brand" pending={pending("brand")}>
            <Value>{data.brand}</Value>
          </Field>
          <Field label="Tagline" pending={pending("tagline")}>
            <Value>{data.tagline}</Value>
          </Field>
          <Field label="What you do" pending={pending("whatYouDo")}>
            <Value>{data.whatYouDo}</Value>
          </Field>
          <Field label="Audience" pending={pending("audience")}>
            <Value>{data.audience}</Value>
          </Field>
          <Field label="Where it’s used" pending={pending("whereUsed")}>
            {data.whereUsed === null ? (
              <Value>{null}</Value>
            ) : (
              <div className="relative flex w-full shrink-0 flex-wrap items-start gap-[6px]" data-name="chips">
                {data.whereUsed.map((place) => (
                  <Chip key={place}>{place}</Chip>
                ))}
              </div>
            )}
          </Field>
          <Field label="Never" pending={false}>
            <div className="relative flex w-full shrink-0 flex-wrap items-start gap-[6px]" data-name="chips">
              {data.never.map((word) => (
                <Chip key={word} tone="never">
                  {word}
                </Chip>
              ))}
            </div>
          </Field>
        </div>
      </ArtifactCard>
    </div>
  );
}
