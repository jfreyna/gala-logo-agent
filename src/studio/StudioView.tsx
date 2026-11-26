import { useEffect, useRef, type ReactNode } from "react";
import { Header } from "../components/Header";
import { PromptBar, type Attachment } from "./PromptBar";
import { StreamEntry } from "./StreamEntry";
import { InlineError } from "./Feedback";
import type { ArtifactAction, StreamItem } from "./streamTypes";

/**
 * The studio (Figma "Studio" frames): the header, the conversation with the
 * prompt bar under it, and the work panel beside them when it is open. On a
 * phone the panel takes the whole screen instead.
 */
export function StudioView({
  projectName,
  items,
  onAction,
  panel,
  onOpenWork,
  prompt,
  startAtTop = false,
  restAtBottom = false,
  menuOpen = false,
}: {
  projectName: string;
  items: StreamItem[];
  /** What the person did on a card, and the id of the card it was done on. */
  onAction: (action: ArtifactAction, itemId: string) => void;
  /** The work panel, or null when it is closed. */
  panel: ReactNode | null;
  onOpenWork: () => void;
  /** Leave a long conversation at its start instead of its newest item. */
  startAtTop?: boolean;
  /** Rest a short conversation against the prompt bar instead of the top. */
  restAtBottom?: boolean;
  /** Shows the account menu open from the start. Used by the dev preview only. */
  menuOpen?: boolean;
  prompt: {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    placeholder: string;
    placeholderMobile: string;
    working: string | null;
    workingMobile: string | null;
    onStop: () => void;
    attachment: Attachment | null;
    onAttach: (file: File) => void;
    onRemoveAttachment: () => void;
    /** The attach button, shown only at the brief (FRI-1721). */
    canAttach?: boolean;
    hints: string[];
    hintsOpen?: boolean;
    focusRequest?: number;
    /** A reason under the bar: why the last send failed (with the words and the file kept), or why Stop didn't go through. */
    sendError?: string | null;
    /** True when that reason is a failed send: the bar shows Send failed. */
    sendFailed?: boolean;
    /** A card action handed the next move to the box (Handed off). */
    handedOff?: boolean;
  };
}) {
  const conversation = useRef<HTMLDivElement>(null);

  // Keep the newest item in view, the way a conversation reads. The bottom padding is inside the scroll height, so it shows too.
  useEffect(() => {
    const element = conversation.current;
    if (element && !startAtTop) element.scrollTop = element.scrollHeight;
  }, [items.length, startAtTop]);

  return (
    <div className="relative flex h-full w-full flex-col items-start overflow-clip bg-background-2-light dark:bg-background-1-dark" data-name="Studio">
      <Header state="signedIn" context={projectName} onOpenWork={onOpenWork} menuOpen={menuOpen} />
      <div className="relative flex min-h-px w-full flex-[1_0_0] items-start overflow-clip" data-name="main">
        <div
          className="relative flex h-full min-w-px flex-[1_0_0] flex-col items-center overflow-clip px-[16px] pb-[16px] desktop:px-[24px] desktop:pb-[32px]"
          data-name="body"
        >
          {/*
            The scroll area runs from the header's bottom edge to the prompt bar's top edge, so content passes right up
            to both, with no fade (FRI-1709; the viewport fix folded into FRI-1721). The spacing lives inside the
            scrolling content: at rest the first item starts 48px (24px on a phone) below the header, and the last rests
            92px (52px) above the prompt bar, FRI-1709's numbers.
          */}
          <div className="relative flex min-h-px w-full max-w-[768px] flex-[1_0_0] flex-col items-start" data-name="conversation-area">
            <div ref={conversation} className="conversation relative flex min-h-px w-full flex-[1_0_0] flex-col items-start overflow-y-auto" data-name="conversation">
              <div className={`relative flex w-full shrink-0 flex-col items-start gap-[20px] pb-[52px] pt-[24px] desktop:gap-[28px] desktop:pb-[92px] desktop:pt-[48px] ${restAtBottom ? "mt-auto" : ""}`} data-name="conversation-content">
                {items.map((item) => (
                  <StreamEntry key={item.id} item={item} onAction={(action) => onAction(action, item.id)} />
                ))}
              </div>
            </div>
          </div>
          <div className="relative flex w-full max-w-[768px] shrink-0 flex-col items-start gap-[8px]" data-name="composer">
            <PromptBar {...prompt} failed={prompt.sendFailed ?? prompt.sendError != null} />
            {prompt.sendError != null && <InlineError>{prompt.sendError}</InlineError>}
          </div>
        </div>
        {panel}
      </div>
    </div>
  );
}
