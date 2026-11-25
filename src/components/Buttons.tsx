import type { ButtonHTMLAttributes, ReactNode } from "react";
import googleLogo from "../assets/icons/google.svg";
import googleMask from "../assets/icons/google-mask.svg";

/**
 * Button-Primary-Large (Frilly design system): the one primary action on a
 * surface. 48 tall, fully rounded, label in Title Case.
 */
export function PrimaryButton({
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className={`relative flex h-[48px] shrink-0 items-center justify-center gap-[9px] rounded-[30px] bg-button-1-default-light dark:bg-button-1-default-dark ${className}`}
    >
      <span className="shrink-0 whitespace-nowrap text-center font-headings text-[16px] font-bold capitalize leading-[20px] text-brand-secondary-50 dark:text-button-light-text">
        {children}
      </span>
    </button>
  );
}

/** Button-Google-Large (Frilly design system), light and dark. */
export function GoogleButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex h-[48px] shrink-0 items-center justify-center gap-[13px] rounded-[30px] border border-solid border-neutral-900 bg-neutral-0 dark:border-form-stroke-dark dark:bg-brand-tertiary-900 ${className}`}
    >
      <span className="relative inline-grid shrink-0 grid-cols-[max-content] grid-rows-[max-content] place-items-start leading-[0]">
        <span
          className="relative col-start-1 row-start-1 block h-[24px] w-[23.52px]"
          style={{
            maskImage: `url("${googleMask}")`,
            WebkitMaskImage: `url("${googleMask}")`,
            maskSize: "24px 24px",
            WebkitMaskSize: "24px 24px",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
          }}
        >
          <img alt="" src={googleLogo} className="absolute inset-0 block size-full max-w-none" />
        </span>
      </span>
      <span className="shrink-0 whitespace-nowrap text-center font-['Google_Sans',Roboto,Arial,sans-serif] text-[16px] font-medium capitalize not-italic leading-[20px] text-neutral-900 dark:text-neutral-0">
        Continue with google
      </span>
    </button>
  );
}
