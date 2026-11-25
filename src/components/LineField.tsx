import type { InputHTMLAttributes } from "react";

/**
 * gala-line-field (Figma 5560:10369): a one-line field on the form tokens.
 * `invalid` outlines it in the error color.
 */
export function LineField({
  invalid = false,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={`type-body-regular h-[40px] min-w-px rounded-[6px] border border-solid bg-form-background-light px-[12px] text-[16px] text-text-neutral-1-light outline-none placeholder:text-text-neutral-2-light dark:bg-form-background-dark dark:text-text-neutral-1-dark dark:placeholder:text-text-neutral-2-dark ${
        invalid ? "border-error-text-light dark:border-error-text-dark" : "border-form-stroke-light dark:border-form-stroke-dark"
      } ${className}`}
    />
  );
}

/**
 * The same field with a character count at its right edge ("62/280"), used
 * for the one-line reasons in the picks card.
 */
export function CountedLineField({
  value,
  onChange,
  limit,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  limit: number;
  placeholder: string;
  label: string;
}) {
  return (
    <label
      className="relative flex h-[40px] w-full min-w-px shrink-0 items-center justify-between gap-[12px] rounded-[6px] border border-solid border-form-stroke-light bg-form-background-light px-[12px] dark:border-form-stroke-dark dark:bg-form-background-dark"
      data-name="gala-line-field"
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, limit))}
        maxLength={limit}
        placeholder={placeholder}
        aria-label={label}
        className="type-body-regular min-w-px flex-[1_0_0] bg-transparent text-text-neutral-1-light outline-none placeholder:text-text-neutral-2-light dark:text-text-neutral-1-dark dark:placeholder:text-text-neutral-2-dark"
      />
      <span className="type-mini-medium shrink-0 text-text-neutral-2-light dark:text-text-neutral-2-dark">
        {value.length}/{limit}
      </span>
    </label>
  );
}
