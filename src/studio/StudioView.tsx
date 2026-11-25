import { useEffect, useRef, type ReactNode } from "react";
import { Header } from "../components/Header";
import { PromptBar, type Attachment } from "./PromptBar";
import { StreamEntry } from "./StreamEntry";
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
    hints: string[];
    hintsOpen?: boolean;
    focusRequest?: number;
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
          className="relative flex h-full min-w-px flex-[1_0_0] flex-col items-center gap-[20px] overflow-clip px-[16px] pb-[16px] pt-[24px] desktop:gap-[28px] desktop:px-[24px] desktop:pb-[32px] desktop:pt-[48px]"
          data-name="body"
        >
          {/* The conversation clips with a hard edge. Its last item rests 64px (32px on a phone) above the bottom of the scroll area, then the 28px (20px) gap, then the prompt bar. */}
          <div className="relative flex min-h-px w-full max-w-[768px] flex-[1_0_0] flex-col items-start" data-name="conversation-area">
            <div ref={conversation} className="conversation relative flex min-h-px w-full flex-[1_0_0] flex-col items-start overflow-y-auto" data-name="conversation">
              <div className={`relative flex w-full shrink-0 flex-col items-start gap-[20px] pb-[32px] desktop:gap-[28px] desktop:pb-[64px] ${restAtBottom ? "mt-auto" : ""}`} data-name="conversation-content">
                {items.map((item) => (
                  <StreamEntry key={item.id} item={item} onAction={(action) => onAction(action, item.id)} />
                ))}
              </div>
            </div>
          </div>
          <div className="relative flex w-full max-w-[768px] shrink-0 flex-col items-start" data-name="composer">
            <PromptBar {...prompt} />
          </div>
        </div>
        {panel}
      </div>
    </div>
  );
}
