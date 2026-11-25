import type { ReactNode } from "react";
import { chipClass, chipLabelClass, SECONDARY, SECONDARY_LABEL } from "../../components/states";

/**
 * The pieces the wordmark and lockup cards share (Figma gala-wordmark
 * 5648:15971, gala-lockup 5653:16465): a white or black preview tile with
 * its caption, a row of chips for one setting, and the two actions.
 */

/** A preview on paper with its caption under it: "At 32px", "Inverted". */
export function Tile({ caption, inverted = false, className, children }: { caption: string; inverted?: boolean; className: string; children: ReactNode }) {
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px] overflow-clip desktop:min-w-px desktop:flex-[1_0_0]" data-name={`size/${caption}`}>
      <div className={`relative flex w-full shrink-0 items-center justify-center overflow-clip rounded-[12px] ${inverted ? "bg-[#000000]" : "bg-neutral-0"} ${className}`} data-name="preview">
        {children}
      </div>
      <p className="type-mini-medium shrink-0 whitespace-nowrap text-text-neutral-2-light dark:text-text-neutral-2-dark">{caption}</p>
    </div>
  );
}

/**
 * gala-filter-chip (Figma 5548:7011) as a choice: Selected sits on the
 * one-step-up surface, Default is the quiet outlined pill; both have the
 * chip's states (components/states.ts).
 */
function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} disabled={disabled} aria-pressed={selected} className={chipClass(selected)} data-name="gala-filter-chip">
      <span className={chipLabelClass(selected)}>{label}</span>
    </button>
  );
}

/** One setting: its name, and its values as chips. */
export function Field<K extends string>({ name, options, value, disabled, onPick }: { name: string; options: [K, string][]; value: K; disabled: boolean; onPick: (value: K) => void }) {
  return (
    <div className="relative flex shrink-0 flex-col items-start gap-[8px] overflow-clip" data-name={`field/${name}`}>
      <p className="type-caption-medium shrink-0 whitespace-nowrap text-text-neutral-2-light dark:text-text-neutral-2-dark">{name}</p>
      <div className="relative flex shrink-0 items-start gap-[8px] overflow-clip" data-name="options">
        {options.map(([key, label]) => (
          <Choice key={key} label={label} selected={key === value} disabled={disabled} onPress={() => onPick(key)} />
        ))}
      </div>
    </div>
  );
}

export function Settings({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[12px] overflow-clip desktop:flex-row desktop:gap-[32px]" data-name="settings">
      {children}
    </div>
  );
}

/** The card's two answers: go back and change, or sign off. */
export function Actions({ change, approve, disabled, onChange, onApprove }: { change: string; approve: string; disabled: boolean; onChange: () => void; onApprove: () => void }) {
  const button = `relative flex h-[40px] w-full shrink-0 items-center justify-center overflow-clip rounded-[12px] px-[16px] desktop:w-auto desktop:min-w-px desktop:flex-[1_0_0] ${SECONDARY}`;
  const label = `type-caption-semibold shrink-0 whitespace-nowrap ${SECONDARY_LABEL}`;
  return (
    <div className="relative flex w-full shrink-0 flex-col items-start gap-[8px] overflow-clip desktop:flex-row" data-name="actions">
      <button type="button" onClick={onChange} disabled={disabled} className={button} data-name="change">
        <span className={label}>{change}</span>
      </button>
      <button type="button" onClick={onApprove} disabled={disabled} className={button} data-name="approve">
        <span className={label}>{approve}</span>
      </button>
    </div>
  );
}

/** The card's title on the left and what it shows on the right. */
export function Heading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="relative flex w-full shrink-0 items-center justify-between gap-[12px] overflow-clip whitespace-nowrap" data-name="heading">
      <p className="type-body-semibold shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">{title}</p>
      <p className="type-caption-medium min-w-px truncate text-text-neutral-1-light dark:text-text-neutral-1-dark">{detail}</p>
    </div>
  );
}
