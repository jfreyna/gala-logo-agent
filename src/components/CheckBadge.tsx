import { Icon } from "./Icon";

/**
 * gala-check-badge (Figma 5531:2820): one of Gala's checks on a draft.
 * Pass: a green check, the label in the text color. Fail: an x, both in the
 * error color.
 */
export function CheckBadge({ label, pass }: { label: string; pass: boolean }) {
  return (
    <span className="relative flex shrink-0 items-center gap-[4px]" data-name="gala-check-badge">
      {pass ? (
        <Icon name="check" className="text-text-green-1-light dark:text-text-green-1-dark" />
      ) : (
        <Icon name="x" className="text-error-text-light dark:text-error-text-dark" />
      )}
      <span className="sr-only">{pass ? "Passes:" : "Fails:"}</span>
      <span
        className={`type-mini-semibold shrink-0 whitespace-nowrap ${
          pass ? "text-text-neutral-1-light dark:text-text-neutral-1-dark" : "text-error-text-light dark:text-error-text-dark"
        }`}
      >
        {label}
      </span>
    </span>
  );
}
