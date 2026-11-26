import { useState, type ReactNode } from "react";
import { DownloadChip, InlineError } from "../Feedback";
import { CheckBadge } from "../../components/CheckBadge";
import { Icon } from "../../components/Icon";
import { useGoogleFont } from "../../lib/googleFont";
import { ColorSummary, Palette } from "./Colors";
import type { ArtifactView, ColorView, HistoryView, KitView, MemoryLine, MemoryView, PanelView, Phase, TypeFamily, TypeView } from "./types";
import { chipClass, chipLabelClass, LINK, PLAIN, SECONDARY, SECONDARY_LABEL } from "../../components/states";

/**
 * gala-work-panel (Figma 5535:4481): the panel beside the conversation.
 * History lists the steps of the work; the other views (Artifact, Color,
 * Type, Kit, Memory) open from it or from the chat, with a back arrow.
 * On a phone it takes the whole screen.
 */

function IconButton({ icon, label, onClick }: { icon: "back" | "close"; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`relative flex size-[36px] shrink-0 items-center justify-center overflow-clip rounded-[8px] text-text-neutral-2-light dark:text-text-neutral-2-dark ${PLAIN}`}
    >
      <Icon name={icon} />
    </button>
  );
}

function Shell({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <aside
      className="fixed inset-0 z-40 flex flex-col items-start bg-background-2-light desktop:static desktop:z-auto desktop:h-full desktop:w-[440px] desktop:shrink-0 desktop:border-l desktop:border-t desktop:border-solid desktop:border-stroke-1-light dark:bg-background-1-dark dark:desktop:border-stroke-1-dark"
      data-name="gala-work-panel"
    >
      <div
        className="relative flex w-full shrink-0 items-center justify-between overflow-clip border-b border-solid border-stroke-1-light px-[16px] py-[12px] dark:border-stroke-1-dark"
        data-name="panel-header"
      >
        {header}
      </div>
      {children}
    </aside>
  );
}

function SubHeader({ heading, onBack, onClose }: { heading: string; onBack: () => void; onClose: () => void }) {
  return (
    <>
      <div className="relative flex shrink-0 items-center gap-[4px] overflow-clip" data-name="title">
        <IconButton icon="back" label="Back to the work" onClick={onBack} />
        <h2 className="shrink-0 font-headings text-[20px] font-bold leading-[normal] text-headline-2-light dark:text-headline-2-dark">{heading}</h2>
      </div>
      <IconButton icon="close" label="Close" onClick={onClose} />
    </>
  );
}

const STATUS_ICON = { done: "statusDone", current: "statusCurrent", upcoming: "statusUpcoming" } as const;
const STATUS_COLOR = {
  done: "text-text-green-1-light dark:text-text-green-1-dark",
  current: "text-text-blue-1-light dark:text-text-blue-1-dark",
  upcoming: "text-stroke-2-light dark:text-stroke-2-dark",
} as const;

/**
 * gala-phase-row (Figma 5534:3735): Done, Current (outlined) or Upcoming
 * (dimmed). A Done row carries "Back to this step" under its summary
 * (layer `go-back`, 5534:3605 and 5534:3670). The row opens the phase; the
 * link is its own button above it, so the two never nest.
 */
function PhaseRow({ phase, working, onOpen, onGoBack }: { phase: Phase; working: boolean; onOpen: () => void; onGoBack: () => void }) {
  return (
    <div
      className={`relative flex w-full shrink-0 items-start gap-[12px] rounded-[12px] p-[12px] text-left ${
        phase.status === "current" ? "border border-solid border-stroke-2-light dark:border-stroke-2-dark" : ""
      }`}
      data-name="gala-phase-row"
    >
      <button type="button" onClick={onOpen} aria-label={phase.name} className={`absolute inset-0 rounded-[12px] ${PLAIN}`} />
      <Icon name={STATUS_ICON[phase.status]} className={STATUS_COLOR[phase.status]} />
      <span className="relative flex min-w-px flex-[1_0_0] flex-col items-start gap-[4px]" data-name="texts">
        <span className="type-body-semibold w-full text-text-blue-1-light dark:text-text-blue-1-dark">{phase.name}
        </span>
        <span className="type-caption-medium w-full text-text-neutral-1-light dark:text-text-neutral-1-dark">{phase.summary}</span>
        {phase.thumbs !== undefined && phase.thumbs.length > 0 && (
          <span className="relative flex shrink-0 items-start gap-[6px] pt-[4px]" data-name="thumbnails">
            {phase.thumbs.map((url, index) => (
              <span key={index} className="relative flex size-[44px] shrink-0 items-center justify-center overflow-clip rounded-[4px] bg-neutral-0" data-name="thumb">
                <img alt="" src={url} className="size-[32px] shrink-0 object-contain" />
              </span>
            ))}
          </span>
        )}
        {/* Status=Done while working (FRI-1712): going back waits for Gala, and the row says so instead of ignoring the press. */}
        {phase.status === "done" && working && (
          <span className="type-caption-semibold relative shrink-0 whitespace-nowrap text-text-neutral-2-light dark:text-text-neutral-2-dark" data-name="go-back-waiting">
            Back to this step when I finish
          </span>
        )}
        {phase.status === "done" && !working && (
          <button
            type="button"
            onClick={onGoBack}
            className={`type-caption-semibold relative z-10 shrink-0 whitespace-nowrap text-left ${LINK}`}
            data-name="go-back"
          >
            Back to this step
          </button>
        )}
      </span>
      <Icon name="chevron" className="text-text-neutral-2-light dark:text-text-neutral-2-dark" />
    </div>
  );
}

function History({ data, onOpenPhase, onGoBack, onOpenMemory, onClose, onDownloadFormat }: { data: HistoryView } & Pick<Props, "onOpenPhase" | "onGoBack" | "onOpenMemory" | "onClose" | "onDownloadFormat">) {
  return (
    <Shell
      header={
        <>
          <div className="relative flex shrink-0 flex-col items-start gap-[2px] overflow-clip" data-name="title">
            <h2 className="shrink-0 font-headings text-[20px] font-bold leading-[normal] text-headline-2-light dark:text-headline-2-dark">Work</h2>
            <p className="type-caption-medium shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">{data.projectName}</p>
          </div>
          <div className="relative flex shrink-0 items-center gap-[8px] overflow-clip" data-name="actions">
            <button
              type="button"
              onClick={onOpenMemory}
              className={`type-caption-semibold relative flex shrink-0 items-start overflow-clip rounded-[8px] px-[8px] py-[6px] ${LINK}`}
              data-name="memory-link"
            >
              Memory
            </button>
            <IconButton icon="close" label="Close" onClick={onClose} />
          </div>
        </>
      }
    >
      <div className="relative flex min-h-px w-full flex-[1_0_0] flex-col items-start gap-[4px] overflow-y-auto px-[16px] py-[12px]" data-name="history">
        {data.phases.map((phase) => (
          <PhaseRow key={phase.key} phase={phase} working={data.working === true} onOpen={() => onOpenPhase(phase.key)} onGoBack={() => onGoBack(phase.key)} />
        ))}
      </div>
      <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px] overflow-clip border-t border-solid border-stroke-1-light p-[16px] dark:border-stroke-1-dark" data-name="kit">
        <p className="type-caption-semibold shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">Kit</p>
        <div className={`relative flex shrink-0 items-start gap-[8px] ${data.kitReady ? "" : "opacity-50"}`} data-name="formats">
          {data.formats.map((format) => (
            <DownloadChip key={format} label={format} state={data.downloads?.[format] ?? "idle"} disabled={!data.kitReady} onPress={() => onDownloadFormat(format)} />
          ))}
        </div>
        {!data.kitReady && <p className="type-mini-medium shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">Ready after the stress test.</p>}
      </div>
    </Shell>
  );
}

function Artifact({ data, onBack, onClose, onChoose }: { data: ArtifactView; onBack: () => void; onClose: () => void; onChoose: () => void }) {
  return (
    <Shell header={<SubHeader heading={data.heading} onBack={onBack} onClose={onClose} />}>
      <div className="relative flex min-h-px w-full flex-[1_0_0] flex-col items-start gap-[12px] overflow-y-auto p-[16px]" data-name="artifact">
        <div className="relative flex aspect-square w-full shrink-0 items-center justify-center overflow-clip rounded-[12px] bg-neutral-0" data-name="paper">
          <img alt={`${data.letter}: ${data.name}`} src={data.markUrl} className="size-[62%] shrink-0 object-contain" />
        </div>
        <div className="relative flex shrink-0 items-baseline gap-[8px]" data-name="title">
          <p className="shrink-0 font-headings text-[20px] font-bold leading-[normal] text-headline-2-light dark:text-headline-2-dark">{data.letter}</p>
          <p className="type-body-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">{data.name}</p>
        </div>
        <p className="type-body-regular w-full shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{data.rationale}</p>
        <div className="relative flex w-full shrink-0 flex-wrap items-start gap-x-[12px] gap-y-[8px]" data-name="checks">
          {data.checks.map((check) => (
            <CheckBadge key={check.label} label={check.label} pass={check.pass} />
          ))}
        </div>
        <button
          type="button"
          onClick={onChoose}
          className={`relative flex h-[44px] w-full shrink-0 items-center justify-center rounded-[12px] ${SECONDARY}`}
          data-name="choose"
        >
          <span className={`type-caption-semibold shrink-0 ${SECONDARY_LABEL}`}>Choose {data.letter}</span>
        </button>
      </div>
    </Shell>
  );
}

function Color({ data, onBack, onClose }: { data: ColorView; onBack: () => void; onClose: () => void }) {
  return (
    <Shell header={<SubHeader heading="Color" onBack={onBack} onClose={onClose} />}>
      <div className="relative flex min-h-px w-full flex-[1_0_0] flex-col items-start gap-[12px] overflow-y-auto p-[16px]" data-name="color">
        <ColorSummary colors={data.colors} />
        <p className="type-mini-medium shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">Each color’s full ladder, 50 to 900, comes with the kit.</p>
      </div>
    </Shell>
  );
}

function FilterChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={chipClass(selected)} data-name="gala-filter-chip">
      <span className={chipLabelClass(selected)}>{label}</span>
    </button>
  );
}

/**
 * gala-type-row (Figma 5548:7028, light 5548:7012, dark 5548:7020): the
 * brand name set in one family on white paper, with its name and "Use for
 * A" under it, and a divider under each row, so a scrolled list never
 * leaves a name between two specimens.
 */
function TypeRow({ family, brandName, letter, onUse }: { family: TypeFamily; brandName: string; letter: string; onUse: () => void }) {
  useGoogleFont(family.family, brandName);
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px] border-b border-solid border-form-stroke-light pb-[10px] dark:border-form-stroke-dark" data-name="gala-type-row">
      <div className="relative flex w-full shrink-0 items-center rounded-[8px] bg-neutral-0 px-[16px] py-[12px]" data-name="paper">
        <p className="shrink-0 whitespace-nowrap text-[24px] leading-[normal] text-[#000000]" style={{ fontFamily: `"${family.family}", serif` }}>
          {brandName}
        </p>
      </div>
      <div className="relative flex w-full shrink-0 items-center justify-between" data-name="meta">
        <div className="relative flex shrink-0 items-baseline gap-[8px]" data-name="names">
          <p className="type-body-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">{family.family}</p>
          <p className="type-mini-semibold shrink-0 text-headline-1-light dark:text-headline-1-dark">{family.category}</p>
        </div>
        {family.current ? (
          <p className="type-caption-semibold shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">Current</p>
        ) : (
          <button type="button" onClick={onUse} className={`type-caption-semibold shrink-0 ${LINK}`}>
            Use for {letter}
          </button>
        )}
      </div>
    </div>
  );
}

function Type({ data, onBack, onClose, onFilter, onUseFamily }: { data: TypeView; onBack: () => void; onClose: () => void } & Pick<Props, "onFilter" | "onUseFamily">) {
  return (
    <Shell header={<SubHeader heading={`Change ${data.letter}`} onBack={onBack} onClose={onClose} />}>
      <div className="relative flex min-h-px w-full flex-[1_0_0] flex-col items-start gap-[16px] overflow-y-auto p-[16px]" data-name="type-tray">
        <p className="type-mini-medium w-full shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">{data.replacing}</p>
        <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px]" data-name="filter/Category">
          <p className="type-mini-semibold shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">Category</p>
          <div className="relative flex w-full shrink-0 flex-wrap items-start gap-[6px]" data-name="chips">
            {data.categories.map((category) => (
              <FilterChip key={category} label={category} selected={category === data.selectedCategory} onClick={() => onFilter({ category })} />
            ))}
          </div>
        </div>
        <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px]" data-name="filter/Mood">
          <p className="type-mini-semibold shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">Mood</p>
          <div className="relative flex w-full shrink-0 flex-wrap items-start gap-[6px]" data-name="chips">
            {data.moods.map((mood) => (
              <FilterChip key={mood} label={mood} selected={data.selectedMoods.includes(mood)} onClick={() => onFilter({ mood })} />
            ))}
          </div>
        </div>
        <p className="type-mini-medium shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">{data.sortNote}</p>
        <div className="relative flex w-full shrink-0 flex-col items-start gap-[16px]" data-name="families">
          {data.families.map((family) => (
            <TypeRow key={family.family} family={family} brandName={data.brandName} letter={data.letter} onUse={() => onUseFamily(family.family)} />
          ))}
        </div>
      </div>
    </Shell>
  );
}

function SpecSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="relative flex w-full shrink-0 flex-col items-start gap-[8px]" data-name={`section/${title}`}>
      <h3 className="type-caption-semibold shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">{title}</h3>
      {children}
    </section>
  );
}

function KitSpec({ data, onBack, onClose }: { data: KitView; onBack: () => void; onClose: () => void }) {
  useGoogleFont(data.type.family, data.brandName + "Aa Bb Cc Dd Ee 0123456789");
  const fontFamily = `"${data.type.family}", serif`;
  const caption = "type-mini-medium w-full shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark";
  return (
    <Shell header={<SubHeader heading="Spec sheet" onBack={onBack} onClose={onClose} />}>
      <div className="relative flex min-h-px w-full flex-[1_0_0] flex-col items-start gap-[24px] overflow-y-auto p-[16px]" data-name="spec-sheet">
        {data.colorway !== undefined && (
          <SpecSection title="Colorway">
            <div
              className={`relative flex h-[180px] w-full shrink-0 items-center justify-center overflow-clip rounded-[12px] ${data.colorway.paper === null ? "bg-neutral-0" : ""}`}
              style={data.colorway.paper === null ? undefined : { backgroundColor: data.colorway.paper }}
              data-name="paper"
            >
              <div className="relative flex max-w-full shrink-0 items-center justify-center p-[18px]" data-name="logo">
                <img alt={`${data.brandName} in the colorway you picked`} src={data.colorway.previewUrl} className="max-h-[60px] max-w-full object-contain" />
              </div>
            </div>
            {data.colorway.title !== null && <p className="type-body-semibold w-full shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">{data.colorway.title}</p>}
            <div className="relative flex shrink-0 flex-wrap items-start gap-[12px]" data-name="contrast">
              {data.colorway.pairs.map((pair) => (
                <CheckBadge key={pair.label} label={pair.label} pass={pair.pass} />
              ))}
            </div>
            <p className={caption}>{data.colorway.caption}</p>
          </SpecSection>
        )}
        <SpecSection title="Clear space">
          <div
            className={`relative flex h-[150px] w-full shrink-0 items-center justify-center overflow-clip rounded-[12px] ${data.clearSpace.paper ? "" : "bg-neutral-0"}`}
            style={data.clearSpace.paper ? { backgroundColor: data.clearSpace.paper } : undefined}
            data-name="paper"
          >
            <div className="relative flex shrink-0 items-center p-[18px]" style={{ border: `1px dashed ${data.clearSpace.zoneColor}` }} data-name="clear-zone">
              <img alt="" src={data.clearSpace.previewUrl} className="max-h-[40px] max-w-[240px] object-contain" />
            </div>
          </div>
          <p className={caption}>{data.clearSpace.caption}</p>
        </SpecSection>
        <SpecSection title="Minimum sizes">
          {data.minimumSizes.map((size) => (
            <div key={size.item} className="relative flex w-full shrink-0 items-start justify-between" data-name={`size/${size.item}`}>
              <p className="type-caption-medium shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{size.item}</p>
              <p className="type-caption-semibold shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">{size.value}</p>
            </div>
          ))}
        </SpecSection>
        <SpecSection title="Type">
          <div className="relative flex w-full shrink-0 flex-col items-start gap-[4px] overflow-clip rounded-[8px] bg-neutral-0 px-[16px] py-[12px]" data-name="paper">
            <p className="shrink-0 whitespace-nowrap text-[24px] leading-[normal] text-[#000000]" style={{ fontFamily }}>
              {data.brandName}
            </p>
            <p className="shrink-0 whitespace-nowrap text-[13px] leading-[normal] text-[rgba(0,0,0,0.55)]" style={{ fontFamily }}>
              Aa Bb Cc Dd Ee 0123456789
            </p>
          </div>
          <p className={caption}>{data.type.caption}</p>
        </SpecSection>
        <SpecSection title="Colors">
          <Palette colors={data.colors} />
        </SpecSection>
      </div>
    </Shell>
  );
}

function MemoryRow({ line, error, onEdit, onRemove }: { line: MemoryLine; error?: string; onEdit: (text: string) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  function commit() {
    if (draft !== null && draft.trim().length > 0 && draft.trim() !== line.text) onEdit(draft.trim());
    setDraft(null);
  }

  return (
    <>
    <div className="relative flex w-full shrink-0 items-start gap-[8px] overflow-clip rounded-[8px] border border-solid border-stroke-1-light p-[12px] dark:border-stroke-1-dark" data-name="memory-row">
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          rows={2}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              commit();
            }
            if (event.key === "Escape") setDraft(null);
          }}
          aria-label="Edit this line"
          className="type-body-regular min-w-px flex-[1_0_0] resize-none bg-transparent text-text-neutral-1-light outline-none [field-sizing:content] dark:text-text-neutral-1-dark"
        />
      ) : (
        <p className="type-body-regular min-w-px flex-[1_0_0] text-text-neutral-1-light dark:text-text-neutral-1-dark">{line.text}</p>
      )}
      <div className="relative flex shrink-0 items-start gap-[4px] overflow-clip text-text-neutral-2-light dark:text-text-neutral-2-dark" data-name="actions">
        <button type="button" onClick={() => setDraft(line.text)} aria-label="Edit" className={`flex size-[28px] shrink-0 items-center justify-center rounded-[8px] ${PLAIN}`}>
          <Icon name="edit" />
        </button>
        <button type="button" onClick={onRemove} aria-label="Remove" className={`flex size-[28px] shrink-0 items-center justify-center rounded-[8px] ${PLAIN}`}>
          <Icon name="remove" />
        </button>
      </div>
    </div>
    {error !== undefined && <InlineError>{error}</InlineError>}
    </>
  );
}

function Memory({ data, onBack, onClose, onAddMemory, onEditMemory, onRemoveMemory, onClearMemory }: { data: MemoryView; onBack: () => void; onClose: () => void } & Pick<Props, "onAddMemory" | "onEditMemory" | "onRemoveMemory" | "onClearMemory">) {
  const [adding, setAdding] = useState("");
  const [confirming, setConfirming] = useState(data.confirming === true);
  const groups = [...new Set(data.lines.map((line) => line.group))];

  function add() {
    if (adding.trim().length === 0) return;
    onAddMemory(adding.trim());
    setAdding("");
  }

  return (
    <Shell header={<SubHeader heading="Memory" onBack={onBack} onClose={onClose} />}>
      <div className="relative flex min-h-px w-full flex-[1_0_0] flex-col items-start gap-[20px] overflow-y-auto p-[16px]" data-name="memory">
        <p className="type-caption-medium w-full shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">Used across all your projects. Change or remove anything.</p>
        {groups.map((group) => (
          <section key={group} className="relative flex w-full shrink-0 flex-col items-start gap-[8px]" data-name={`section/${group}`}>
            <h3 className="type-caption-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">{group}</h3>
            {data.lines
              .filter((line) => line.group === group)
              .map((line) => (
                <MemoryRow key={line.id} line={line} error={data.errors?.[line.id]} onEdit={(text) => onEditMemory(line.id, text)} onRemove={() => onRemoveMemory(line.id)} />
              ))}
          </section>
        ))}
        <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px]" data-name="add">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
          className="relative flex w-full shrink-0 items-center gap-[8px] overflow-clip rounded-[8px] border border-dashed border-stroke-1-light py-[10px] pl-[12px] pr-[8px] dark:border-stroke-1-dark"
          data-name="add-memory"
        >
          <input
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            placeholder="Add something to remember"
            aria-label="Add something to remember"
            className="type-body-regular min-w-px flex-[1_0_0] bg-transparent text-text-neutral-1-light outline-none placeholder:text-text-neutral-2-light dark:text-text-neutral-1-dark dark:placeholder:text-text-neutral-2-dark"
          />
          <button type="submit" aria-label="Add" className={`flex size-[28px] shrink-0 items-center justify-center rounded-[8px] text-text-neutral-2-light dark:text-text-neutral-2-dark ${PLAIN}`} data-name="add-button">
            <Icon name="plus" />
          </button>
        </form>
        {data.errors?.add !== undefined && <InlineError>{data.errors.add}</InlineError>}
        </div>
        <div className="min-h-px w-full flex-[1_0_0]" data-name="spacer" />
        {confirming ? (
          <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px] rounded-[8px] border border-solid border-stroke-1-light p-[12px] dark:border-stroke-1-dark" data-name="clear-confirm">
            <p className="type-caption-medium w-full shrink-0 text-text-neutral-1-light dark:text-text-neutral-1-dark">Clear everything Gala remembers? This can’t be undone.</p>
            <div className="relative flex shrink-0 items-start gap-[16px]" data-name="actions">
              <button type="button" onClick={() => setConfirming(false)} className={`type-caption-semibold shrink-0 ${LINK}`}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  onClearMemory();
                }}
                className={`type-caption-semibold shrink-0 rounded-[4px] text-error-text-light focus-visible:outline-offset-2 dark:text-error-text-dark ${PLAIN}`}
              >
                Clear all
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={`type-caption-medium shrink-0 rounded-[4px] text-text-neutral-2-light focus-visible:outline-offset-2 dark:text-text-neutral-2-dark ${PLAIN}`} data-name="clear">
            Clear all memory
          </button>
        )}
        {data.errors?.clear !== undefined && <InlineError>{data.errors.clear}</InlineError>}
      </div>
    </Shell>
  );
}

type Props = {
  view: PanelView;
  onClose: () => void;
  onBack: () => void;
  onOpenPhase: (key: string) => void;
  /** "Back to this step" on a Done row. */
  onGoBack: (key: string) => void;
  onOpenMemory: () => void;
  onChooseArtifact: () => void;
  onFilter: (filter: { category?: string; mood?: string }) => void;
  onUseFamily: (family: string) => void;
  onDownloadFormat: (format: string) => void;
  onAddMemory: (text: string) => void;
  onEditMemory: (id: string, text: string) => void;
  onRemoveMemory: (id: string) => void;
  onClearMemory: () => void;
};

export function WorkPanel(props: Props) {
  const { view, onBack, onClose } = props;
  switch (view.view) {
    case "history":
      return <History data={view} onOpenPhase={props.onOpenPhase} onGoBack={props.onGoBack} onOpenMemory={props.onOpenMemory} onClose={onClose} onDownloadFormat={props.onDownloadFormat} />;
    case "artifact":
      return <Artifact data={view} onBack={onBack} onClose={onClose} onChoose={props.onChooseArtifact} />;
    case "color":
      return <Color data={view} onBack={onBack} onClose={onClose} />;
    case "type":
      return <Type data={view} onBack={onBack} onClose={onClose} onFilter={props.onFilter} onUseFamily={props.onUseFamily} />;
    case "kit":
      return <KitSpec data={view} onBack={onBack} onClose={onClose} />;
    case "memory":
      return (
        <Memory
          data={view}
          onBack={onBack}
          onClose={onClose}
          onAddMemory={props.onAddMemory}
          onEditMemory={props.onEditMemory}
          onRemoveMemory={props.onRemoveMemory}
          onClearMemory={props.onClearMemory}
        />
      );
  }
}
