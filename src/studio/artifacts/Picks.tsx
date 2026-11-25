import { useState } from "react";
import { CountedLineField } from "../../components/LineField";
import { Icon } from "../../components/Icon";
import type { PicksArtifact, PicksSubmission } from "./types";
import { Turn } from "./Turn";

/** The longest one-line reason a person can write. */
const QUOTE_LIMIT = 280;

/** gala-pick-thumb (Figma 5560:10356): a draft on paper; selected, it gains a purple outline and a check. */
function PickThumb({ markUrl, selected = false, onSelect }: { markUrl: string; selected?: boolean; onSelect?: () => void }) {
  const className = `relative flex size-[96px] shrink-0 items-center justify-center rounded-[12px] border-solid bg-neutral-0 ${
    selected ? "border-2 border-button-1-default-light dark:border-button-1-default-dark" : "border border-stroke-1-light dark:border-stroke-1-dark"
  }`;
  const content = (
    <>
      <img alt="" src={markUrl} className="size-[64px] shrink-0 object-contain" />
      {selected && (
        <span className="absolute left-[70px] top-[6px] flex size-[20px] items-center justify-center rounded-[999px] bg-button-1-default-light text-button-light-text dark:bg-button-1-default-dark" data-name="selected">
          <Icon name="checkSmall" />
        </span>
      )}
    </>
  );
  if (!onSelect) return <span className={className} data-name="gala-pick-thumb">{content}</span>;
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} aria-label="Pick this draft" className={className} data-name="gala-pick-thumb">
      {content}
    </button>
  );
}

function SectionLabel({ label, helper }: { label: string; helper: string }) {
  return (
    <div className="relative flex shrink-0 items-baseline gap-[8px]" data-name="label">
      <p className="type-caption-semibold shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{label}</p>
      <p className="type-mini-medium shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">{helper}</p>
    </div>
  );
}

/**
 * gala-picks (Figma 5560:10726): the last, optional step. The person picks
 * the draft they liked least and may say why; the final logo, and why they
 * loved it. Submit my picks sends whatever is filled, one or both; Don’t
 * submit sends nothing. The card says where submissions go.
 */
export function Picks({ data, onSubmit, onDecline }: { data: PicksArtifact; onSubmit: (submission: PicksSubmission) => void; onDecline: () => void }) {
  const [hatedId, setHatedId] = useState<string | null>(null);
  const [hatedQuote, setHatedQuote] = useState("");
  const [lovedQuote, setLovedQuote] = useState("");

  function submit() {
    onSubmit({
      hated: hatedId !== null ? { draftId: hatedId, quote: hatedQuote.trim() } : null,
      loved: lovedQuote.trim().length > 0 ? { quote: lovedQuote.trim() } : null,
    });
  }

  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px]" data-name="gala-picks">
      <Turn>{data.say}</Turn>
      <div className="relative flex w-full shrink-0 flex-col items-start gap-[20px] rounded-[16px] bg-background-1-light p-[16px] dark:bg-background-2-dark" data-name="picks">
        <div className="relative flex w-full shrink-0 flex-col items-start gap-[4px]" data-name="heading">
          <p className="type-body-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">Tell me what you loved and what you hated</p>
          <p className="type-caption-medium w-full shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">
            Submitted picks join the Hall of fame and the Hall of shame on my front page, with your brand name and your one-liner. Submit one, both, or neither.
          </p>
        </div>
        <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px]" data-name="hated">
          <SectionLabel label="What you hated" helper="Pick the draft you liked least." />
          <div className="swipe-row relative flex w-full shrink-0 items-start gap-[8px] overflow-x-auto" data-name="drafts">
            {data.drafts.map((draft) => (
              <PickThumb key={draft.id} markUrl={draft.markUrl} selected={draft.id === hatedId} onSelect={() => setHatedId(draft.id === hatedId ? null : draft.id)} />
            ))}
          </div>
          <CountedLineField value={hatedQuote} onChange={setHatedQuote} limit={QUOTE_LIMIT} placeholder="Why? One line, optional." label="Why you hated it" />
        </div>
        <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px]" data-name="loved">
          <SectionLabel label="What you loved" helper="Your final logo." />
          <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px] desktop:flex-row desktop:items-center" data-name="final">
            <PickThumb markUrl={data.finalMarkUrl} />
            <CountedLineField value={lovedQuote} onChange={setLovedQuote} limit={QUOTE_LIMIT} placeholder="Why? One line, optional." label="Why you loved it" />
          </div>
        </div>
        <div className="relative flex w-full shrink-0 flex-col items-center gap-[8px] desktop:flex-row desktop:justify-end desktop:gap-[16px]" data-name="actions">
          <button
            type="button"
            onClick={submit}
            className="relative flex h-[40px] w-full shrink-0 items-center justify-center rounded-[12px] bg-button-1-default-light px-[20px] desktop:order-2 desktop:w-auto dark:bg-button-1-default-dark"
            data-name="submit"
          >
            <span className="type-caption-semibold shrink-0 text-button-light-text">Submit my picks</span>
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="relative flex h-[40px] w-full shrink-0 items-center justify-center rounded-[12px] border border-solid border-stroke-2-light px-[16px] desktop:order-1 desktop:w-auto dark:border-stroke-2-dark"
            data-name="dont-submit"
          >
            <span className="type-caption-semibold shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">Don’t submit</span>
          </button>
        </div>
      </div>
    </div>
  );
}
