import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { PLAIN, PRIMARY } from "../components/states";
import { useReducedMotion } from "../lib/motion";

/** What the box asks when a card action hands the next move to it (gala-prompt-bar State=Handed off). */
const HANDED_OFF = "Tell me what you’d like to change…";

/** A reference file the person has attached and not yet sent. */
export type Attachment = { fileName: string; previewUrl: string | null };

/**
 * gala-prompt-bar (Figma 5525:2697): Hints, the attach button, the prompt,
 * and the send button. States: Empty (send dimmed), Typing, Attached (a file
 * chip before the prompt), Working (Gala's status in place of the prompt,
 * and a stop button).
 *
 * After the brief the attach button is gone (gala-prompt-bar / no clip,
 * Figma 5676:17707, FRI-1721). A file picked at the brief and not yet sent
 * keeps its chip and still sends; the engine answers it.
 */
export function PromptBar({
  value,
  onChange,
  onSend,
  placeholder,
  placeholderMobile,
  working,
  workingMobile,
  onStop,
  attachment,
  onAttach,
  onRemoveAttachment,
  canAttach = true,
  hints,
  hintsOpen = false,
  focusRequest = 0,
  failed = false,
  handedOff = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  placeholderMobile: string;
  /** Gala's status line while working, or null when the person can type. */
  working: string | null;
  workingMobile: string | null;
  onStop: () => void;
  attachment: Attachment | null;
  onAttach: (file: File) => void;
  onRemoveAttachment: () => void;
  /** Shows the attach button. True only while the project is at the brief (FRI-1721). */
  canAttach?: boolean;
  /** Example lines for the current step. Pressing one fills the prompt. */
  hints: string[];
  /** Shows the hints open from the start. Used by the dev preview only. */
  hintsOpen?: boolean;
  /** Change this number to move the cursor into the prompt. */
  focusRequest?: number;
  /** Send failed (FRI-1712): the words and the file are kept, and the border says so. */
  failed?: boolean;
  /**
   * Handed off (FRI-1715): a card action passed the next move to this box.
   * A 2px button-1 border eases in, and the placeholder asks what to change,
   * typing itself in once. The page turns it off when the person types, or
   * after 6 seconds.
   */
  handedOff?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [showHints, setShowHints] = useState(hintsOpen);
  const reduced = useReducedMotion();
  const [typed, setTyped] = useState(0);

  // The hand-off placeholder types itself in once, a letter at a time; all at once when motion is reduced.
  useEffect(() => {
    if (!handedOff) {
      setTyped(0);
      return;
    }
    if (reduced) {
      setTyped(HANDED_OFF.length);
      return;
    }
    setTyped(0);
    const timer = window.setInterval(() => setTyped((count) => (count >= HANDED_OFF.length ? count : count + 1)), 28);
    return () => window.clearInterval(timer);
  }, [handedOff, reduced]);
  const shownPlaceholder = handedOff ? HANDED_OFF.slice(0, typed) : placeholder;
  const shownPlaceholderMobile = handedOff ? HANDED_OFF.slice(0, typed) : placeholderMobile;

  // Put the cursor at the end of whichever prompt field is on screen.
  useEffect(() => {
    if (focusRequest === 0) return;
    const fields = form.current?.querySelectorAll<HTMLTextAreaElement>("textarea") ?? [];
    for (const field of fields) {
      if (field.offsetParent !== null) {
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
      }
    }
  }, [focusRequest]);

  useEffect(() => {
    if (!showHints) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setShowHints(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showHints]);
  const isWorking = working !== null;
  const canSend = !isWorking && (value.trim().length > 0 || attachment !== null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (canSend) onSend();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSend();
    }
  }

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onAttach(file);
    event.target.value = "";
  }

  return (
    <form
      ref={form}
      onSubmit={submit}
      className={`relative flex w-full shrink-0 items-stretch rounded-[20px] border border-solid bg-neutral-0 dark:bg-background-1-dark ${
        failed
          ? "border-error-text-light dark:border-error-text-dark"
          : handedOff
            ? "border-2 border-button-1-default-light dark:border-button-1-default-dark"
            : "border-form-stroke-light dark:border-form-background-dark"
      } transition-[border-color] duration-200 ease-out`}
      data-name="gala-prompt-bar"
      data-state={failed ? "Send failed" : handedOff ? "Handed off" : undefined}
    >
      {showHints && hints.length > 0 && (
        <div
          className="absolute bottom-[calc(100%+12px)] left-1/2 z-20 flex w-full -translate-x-1/2 flex-col items-center justify-center gap-[16px] rounded-[20px] border border-solid border-neutral-0 bg-background-2-light p-[24px] shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.1)] desktop:w-[576px] dark:border-form-background-dark dark:bg-background-1-dark"
          data-name="gala-prompt-hints"
        >
          {hints.map((hint, index) => (
            <div key={hint} className="contents">
              {index > 0 && <div className="h-px w-full shrink-0 bg-neutral-300 dark:bg-stroke-1-dark" data-name="divider" />}
              <button
                type="button"
                onClick={() => {
                  onChange(hint);
                  setShowHints(false);
                }}
                className={`type-body-regular w-full shrink-0 rounded-[4px] text-center text-text-blue-1-light dark:text-text-blue-1-dark ${PLAIN}`}
              >
                {hint}
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setShowHints((value) => !value)}
        aria-expanded={showHints}
        className={`relative flex shrink-0 items-center gap-[6px] overflow-clip border-r border-solid border-form-stroke-light pl-[12px] pr-[10px] desktop:pl-[16px] desktop:pr-[12px] dark:border-stroke-1-dark ${PLAIN}`}
        data-name="hints"
      >
        <span className="type-caption-medium shrink-0 text-text-blue-1-light dark:text-text-blue-1-dark">Hints</span>
        <span className="type-caption-medium relative left-[-6px] w-0 shrink-0 whitespace-nowrap text-text-blue-1-light dark:text-text-blue-1-dark">›</span>
      </button>
      <div className="relative flex min-w-px flex-[1_0_0] items-center gap-[8px] overflow-clip p-[8px]" data-name="input-row">
        {canAttach && (
          <>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              aria-label="Attach a reference file"
              className={`relative flex size-[40px] shrink-0 items-center justify-center overflow-clip rounded-[12px] text-text-neutral-2-light dark:text-text-neutral-2-dark ${PLAIN}`}
              data-name="attach"
            >
              <Icon name="paperclip" />
            </button>
            <input ref={fileInput} type="file" accept="image/*,application/pdf" onChange={pickFile} className="hidden" />
          </>
        )}
        {attachment !== null && (
          <div
            className="relative flex shrink-0 items-center gap-[8px] overflow-clip rounded-[8px] border border-solid border-stroke-1-light bg-background-1-light desktop:border-form-stroke-light py-[4px] pl-[4px] pr-[8px] dark:border-stroke-1-dark dark:bg-background-2-dark"
            data-name="attachment"
          >
            <span className="relative block size-[28px] shrink-0 overflow-clip rounded-[6px] bg-background-3-light dark:bg-background-3-dark" data-name="thumb">
              {attachment.previewUrl !== null && <img alt="" src={attachment.previewUrl} className="size-full object-cover" />}
            </span>
            <span className="type-caption-medium hidden max-w-[160px] shrink-0 truncate text-text-neutral-1-light desktop:block dark:text-text-neutral-1-dark">
              {attachment.fileName}
            </span>
            <button
              type="button"
              onClick={onRemoveAttachment}
              aria-label={`Remove ${attachment.fileName}`}
              className={`shrink-0 rounded-[4px] text-text-neutral-2-light dark:text-text-neutral-2-dark ${PLAIN}`}
            >
              <Icon name="remove" />
            </button>
          </div>
        )}
        {isWorking ? (
          // One line, cut with an ellipsis when it doesn't fit, as the Working variants draw it.
          <p className="type-body-regular min-w-px flex-[1_0_0] truncate text-text-neutral-2-light dark:text-text-neutral-2-dark" role="status">
            <span className="hidden desktop:inline">{working}</span>
            <span className="desktop:hidden">{workingMobile}</span>
          </p>
        ) : (
          <>
            <textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={shownPlaceholder}
              aria-label={handedOff ? HANDED_OFF : placeholder}
              className={`prompt-field type-body-regular hidden min-w-px flex-[1_0_0] resize-none bg-transparent text-text-neutral-1-light outline-none desktop:block dark:text-text-neutral-1-dark ${
                handedOff ? "placeholder:text-text-blue-1-light dark:placeholder:text-text-blue-1-dark" : "placeholder:text-text-neutral-2-light dark:placeholder:text-text-neutral-2-dark"
              }`}
            />
            <textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={shownPlaceholderMobile}
              aria-label={handedOff ? HANDED_OFF : placeholderMobile}
              className={`prompt-field type-body-regular min-w-px flex-[1_0_0] resize-none bg-transparent text-text-neutral-1-light outline-none placeholder:truncate desktop:hidden dark:text-text-neutral-1-dark ${
                handedOff ? "placeholder:text-text-blue-1-light dark:placeholder:text-text-blue-1-dark" : "placeholder:text-text-neutral-2-light dark:placeholder:text-text-neutral-2-dark"
              }`}
            />
          </>
        )}
        {isWorking ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            className={`relative flex size-[44px] shrink-0 items-center justify-center overflow-clip rounded-[12px] text-button-light-text desktop:size-[48px] ${PRIMARY}`}
            data-name="send"
          >
            <Icon name="stop" />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send"
            aria-disabled={!canSend}
            className={`relative flex size-[44px] shrink-0 items-center justify-center overflow-clip rounded-[12px] text-button-light-text desktop:size-[48px] ${PRIMARY} ${canSend ? "" : "pointer-events-none opacity-40"}`}
            data-name="send"
          >
            <Icon name="arrowUp" />
          </button>
        )}
      </div>
    </form>
  );
}
