import frillLight from "../assets/brand/frilly-frill-light.svg";
import birdLight from "../assets/brand/frilly-bird-light.svg";
import frillDark from "../assets/brand/frilly-frill-dark.svg";
import birdDark from "../assets/brand/frilly-bird-dark.svg";

/**
 * gala-footer (Figma 5591:4073): "Built with" and the Frilly logo, one link,
 * opening in a new tab so the visitor's Gala session stays open.
 */
export function Footer() {
  return (
    <footer className="relative flex h-[56px] w-full shrink-0 items-start justify-between bg-background-2-light px-[16px] dark:bg-background-1-dark">
      <a
        className="relative flex min-w-px flex-[1_0_0] cursor-pointer items-start justify-center gap-[8px] pt-[12px]"
        href="https://frillyconcierge.com/?utm_source=gala&utm_medium=referral"
        target="_blank"
        rel="noopener"
        data-name="built-on-frilly"
      >
        <span className="relative shrink-0 whitespace-nowrap text-left font-['Lato'] text-[15px] font-normal not-italic leading-[22px] text-text-neutral-2-light dark:text-text-neutral-2-dark">
          Built with
        </span>
        <span className="relative block h-[36px] w-[88.455px] shrink-0" data-name="Frilly Logo">
          <span className="absolute inset-[0_34.14%_38.99%_0]" data-name="frill">
            <img alt="Frilly" src={frillLight} className="absolute inset-0 block size-full max-w-none dark:hidden" />
            <img alt="Frilly" src={frillDark} className="absolute inset-0 hidden size-full max-w-none dark:block" />
          </span>
          <span className="absolute inset-[0.63%_0_0_59.03%]" data-name="bird">
            <img alt="" src={birdLight} className="absolute inset-0 block size-full max-w-none dark:hidden" />
            <img alt="" src={birdDark} className="absolute inset-0 hidden size-full max-w-none dark:block" />
          </span>
        </span>
      </a>
    </footer>
  );
}
