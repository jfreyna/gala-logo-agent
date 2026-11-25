import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "../lib/router";
import { authClient } from "../lib/auth";
import { Icon } from "./Icon";
import { useTheme } from "../lib/theme";
import galaLogoLight from "../assets/brand/gala-logo-light.svg";
import galaLogoDark from "../assets/brand/gala-logo-dark.svg";
import panelLight from "../assets/icons/panel-light.svg";
import panelDark from "../assets/icons/panel-dark.svg";
import sun from "../assets/icons/sun.svg";
import sunMobile from "../assets/icons/sun-mobile.svg";
import moon from "../assets/icons/moon.svg";
import moonMobile from "../assets/icons/moon-mobile.svg";
import personLight from "../assets/icons/person-light.svg";
import personDark from "../assets/icons/person-dark.svg";

/**
 * gala-header (Figma 5527:2723): Signed in and Signed out, Desktop and
 * Mobile, Light and Dark.
 */
type HeaderProps =
  | { state: "signedOut" }
  | {
      state: "signedIn";
      /** The line after the divider: the project's name, or "Your logos". */
      context: string;
      /** Present in the studio, where the Work button opens the work panel. */
      onOpenWork?: () => void;
      /** Shows the menu open from the start. Used by the dev preview only. */
      menuOpen?: boolean;
    };

/**
 * gala-account-menu (Figma 5620:15441): Your logos and Sign out. It opens
 * under the account button, right edges aligned, 8 below it, and closes on
 * Escape or a press anywhere else.
 */
function AccountMenu({ onYourLogos, onSignOut, initiallyOpen }: { onYourLogos: () => void; onSignOut: () => void; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "relative flex h-[32px] w-full shrink-0 items-center gap-[8px] rounded-[12px] px-[12px] py-[4px] text-left text-text-blue-1-light hover:bg-background-2-dark hover:text-text-blue-1-dark dark:text-text-blue-1-dark";

  return (
    <div ref={root} className="relative flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative flex size-[36px] shrink-0 items-center justify-center overflow-clip rounded-[999px] bg-background-1-light desktop:size-[32px] dark:bg-background-2-dark"
        data-name="account-button"
      >
        <img alt="" src={personLight} width={18} height={18} className="size-[18px] shrink-0 dark:hidden" />
        <img alt="" src={personDark} width={18} height={18} className="hidden size-[18px] shrink-0 dark:block" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 flex w-[200px] flex-col items-start gap-[4px] rounded-[16px] border border-solid border-brand-tertiary-700 bg-background-2-light p-[8px] dark:border-form-background-dark dark:bg-background-1-dark"
          data-name="gala-account-menu"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onYourLogos();
            }}
          >
            <Icon name="grid" />
            <span className="type-caption-medium min-w-px flex-[1_0_0]">Your logos</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <Icon name="logOut" />
            <span className="type-caption-medium min-w-px flex-[1_0_0]">Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ModeToggle() {
  const { mode, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="relative flex size-[40px] shrink-0 items-center desktop:size-auto"
      data-name="mode-toggle"
    >
      <img alt="" src={sun} width={24} height={24} className="hidden size-[24px] shrink-0 desktop:block dark:desktop:hidden" />
      <img alt="" src={sunMobile} width={40} height={40} className="block size-[40px] shrink-0 desktop:hidden dark:hidden" />
      <img alt="" src={moon} width={24} height={24} className="hidden size-[24px] shrink-0 dark:desktop:block" />
      <img alt="" src={moonMobile} width={31} height={31} className="absolute left-[5px] top-[4.5px] hidden size-[31px] dark:block dark:desktop:hidden" />
    </button>
  );
}

export function Header(props: HeaderProps) {
  const signedIn = props.state === "signedIn";
  const { navigate } = useRouter();
  const signOut = () => {
    void authClient.signOut().finally(() => navigate("/"));
  };
  return (
    <header
      className="relative z-30 flex h-[56px] w-full shrink-0 items-center justify-between bg-background-2-light px-[16px] desktop:h-[64px] desktop:px-[24px] dark:bg-background-1-dark"
      data-name="gala-header"
    >
      <div
        className={`relative flex items-center gap-[12px] overflow-clip ${signedIn ? "shrink-0 desktop:h-full desktop:min-w-px desktop:flex-[1_0_0]" : "shrink-0"}`}
        data-name="identity"
      >
        <Link to="/" className="flex shrink-0 items-center gap-[12px]">
          {/* gala-logo-light and gala-logo-dark (Figma 5671:22126, 5671:22239), 100 by 39 at every size. */}
          <img alt="Gala" src={galaLogoLight} width={100} height={39} className="block h-[39px] w-[100px] shrink-0 dark:hidden" />
          <img alt="Gala" src={galaLogoDark} width={100} height={39} className="hidden h-[39px] w-[100px] shrink-0 dark:block" />
        </Link>
        {signedIn && (
          <>
            <div className="h-[20px] w-px shrink-0 bg-stroke-1-light dark:bg-stroke-1-dark" data-name="divider" />
            <p className="type-caption-medium shrink-0 whitespace-nowrap text-text-neutral-2-light dark:text-text-neutral-2-dark">
              {props.context}
            </p>
          </>
        )}
      </div>
      <div
        className={`relative flex shrink-0 items-center ${signedIn ? "gap-[4px] desktop:gap-[12px]" : "gap-[12px] desktop:gap-[20px]"}`}
        data-name="actions"
      >
        {signedIn ? (
          <>
            {props.onOpenWork && (
              <button
                type="button"
                onClick={props.onOpenWork}
                aria-label="Work"
                className="relative flex size-[40px] shrink-0 items-center justify-center overflow-clip rounded-[6px] desktop:size-auto desktop:gap-[6px] desktop:py-[6px] desktop:pl-[10px] desktop:pr-[12px]"
                data-name="work-panel-button"
              >
                <img alt="" src={panelLight} width={20} height={20} className="size-[20px] shrink-0 dark:hidden" />
                <img alt="" src={panelDark} width={20} height={20} className="hidden size-[20px] shrink-0 dark:block" />
                <span className="type-caption-medium hidden shrink-0 whitespace-nowrap text-text-neutral-2-light desktop:block dark:text-text-neutral-2-dark">
                  Work
                </span>
              </button>
            )}
            <ModeToggle />
            <AccountMenu onYourLogos={() => navigate("/")} onSignOut={signOut} initiallyOpen={props.menuOpen === true} />
          </>
        ) : (
          <>
            <Link to="/about" className="type-caption-semibold shrink-0 whitespace-nowrap text-text-neutral-2-light dark:text-text-neutral-2-dark">
              About Gala
            </Link>
            <ModeToggle />
          </>
        )}
      </div>
    </header>
  );
}
