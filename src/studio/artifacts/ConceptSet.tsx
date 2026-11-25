import { ConceptCard } from "../../components/ConceptCard";
import { CheckBadge } from "../../components/CheckBadge";
import type { Concept, ConceptSetArtifact, VariationSetArtifact } from "./types";
import { Turn } from "./Turn";

/** Three cards across the column; a row that swipes sideways on a phone. */
function ConceptRow({ concepts, chosenId, onChoose, name }: { concepts: Concept[]; chosenId: string | null; onChoose: (id: string) => void; name: string }) {
  return (
    <div className="swipe-row relative flex w-full shrink-0 items-start gap-[12px] overflow-x-auto desktop:overflow-visible" data-name={name}>
      {concepts.map((concept) => (
        <ConceptCard
          key={concept.id}
          letter={concept.letter}
          name={concept.name}
          rationale={concept.rationale}
          markUrl={concept.markUrl}
          checks={concept.checks}
          chosen={concept.id === chosenId}
          onChoose={() => onChoose(concept.id)}
          className="desktop:w-auto desktop:min-w-px desktop:flex-[1_0_0]"
        />
      ))}
    </div>
  );
}

/**
 * gala-discarded-strip (Figma 5532:2929): drafts Gala drew and set aside,
 * shown with the reason instead of hidden.
 */
function DiscardedStrip({ drafts }: { drafts: ConceptSetArtifact["discarded"] }) {
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px] rounded-[12px] bg-background-1-light p-[12px] dark:bg-background-2-dark" data-name="gala-discarded-strip">
      <p className="type-caption-semibold shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">
        Set aside {drafts.length} {drafts.length === 1 ? "draft" : "drafts"}
      </p>
      <div className="relative flex w-full shrink-0 flex-wrap items-center gap-x-[20px] gap-y-[8px]" data-name="drafts">
        {drafts.map((draft) => (
          <div key={draft.id} className="relative flex shrink-0 items-center gap-[8px]" data-name="draft">
            <div className="relative flex size-[40px] shrink-0 items-center justify-center overflow-clip rounded-[8px] bg-neutral-0" data-name="thumb">
              <img alt="" src={draft.markUrl} className="size-[32px] shrink-0 object-contain" />
            </div>
            <CheckBadge label={draft.reason} pass={false} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** gala-concept-set (Figma 5533:3286): three directions in black and white, and the drafts set aside. */
export function ConceptSet({ data, onChoose }: { data: ConceptSetArtifact; onChoose: (id: string) => void }) {
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px]" data-name="gala-concept-set">
      <Turn>{data.say}</Turn>
      <ConceptRow concepts={data.concepts} chosenId={data.chosenId} onChoose={onChoose} name="directions" />
      {data.discarded.length > 0 && <DiscardedStrip drafts={data.discarded} />}
    </div>
  );
}

/** gala-variation-set (Figma 5550:7950): three refinements of the chosen direction. */
export function VariationSet({ data, onChoose }: { data: VariationSetArtifact; onChoose: (id: string) => void }) {
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px]" data-name="gala-variation-set">
      <Turn>{data.say}</Turn>
      <ConceptRow concepts={data.concepts} chosenId={data.chosenId} onChoose={onChoose} name="variations" />
    </div>
  );
}
