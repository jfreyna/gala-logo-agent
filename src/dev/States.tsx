import { chipClass, chipLabelClass, LINK, PRIMARY, PRIMARY_LABEL, SECONDARY, SECONDARY_LABEL } from "../components/states";

const STATES = ["Default", "Hover", "Pressed", "Focus", "Disabled"] as const;
const CHIP_STATES = ["Default", "Selected", "Hover", "Selected hover", "Focus", "Disabled", "Selected disabled"] as const;

/**
 * Development only: every button kind and chip in each of its states, laid
 * out like the component sets (gala-button 5666:18006, gala-filter-chip
 * 5548:7011). Each control is a real button with the studio's classes; the
 * check (scripts/check-states.mjs) forces :hover, :active and
 * :focus-visible on it and reads what the browser draws.
 */
export function States() {
  return (
    <div className="flex min-h-full flex-col gap-[24px] bg-background-2-light p-[24px] dark:bg-background-1-dark" data-name="states">
      {(["Primary", "Secondary", "Link"] as const).map((kind) => (
        <div key={kind} className="flex items-center gap-[24px]" data-name={`row/${kind}`}>
          {STATES.map((state) => (
            <button
              key={state}
              type="button"
              disabled={state === "Disabled"}
              data-kind={kind}
              data-state={state}
              className={
                kind === "Primary"
                  ? `relative flex h-[40px] shrink-0 items-center justify-center rounded-[12px] px-[20px] ${PRIMARY}`
                  : kind === "Secondary"
                    ? `relative flex h-[40px] shrink-0 items-center justify-center rounded-[12px] px-[16px] ${SECONDARY}`
                    : `type-caption-semibold shrink-0 whitespace-nowrap ${LINK}`
              }
            >
              {kind === "Link" ? (
                "Back to this step"
              ) : (
                <span className={`type-caption-semibold shrink-0 whitespace-nowrap ${kind === "Primary" ? PRIMARY_LABEL : SECONDARY_LABEL}`}>{kind === "Primary" ? "Use this wordmark" : "Change typeface"}</span>
              )}
            </button>
          ))}
        </div>
      ))}
      <div className="flex items-center gap-[24px]" data-name="row/Chip">
        {CHIP_STATES.map((state) => {
          const selected = state.startsWith("Selected");
          return (
            <button key={state} type="button" disabled={state.endsWith("disabled") || state === "Disabled"} data-kind="Chip" data-state={state} aria-pressed={selected} className={chipClass(selected)}>
              <span className={chipLabelClass(selected)}>Serif</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
