import type {
  BriefArtifact,
  ColorPickerArtifact,
  ColorwaySetArtifact,
  ConceptSetArtifact,
  DirectionArtifact,
  KitArtifact,
  LockupArtifact,
  LockupLayout,
  LockupSpaceBetween,
  PicksArtifact,
  ResearchArtifact,
  StressTestArtifact,
  SymbolOpenerArtifact,
  TypeSetArtifact,
  VariationSetArtifact,
  WordmarkArtifact,
  WordmarkCase,
  WordmarkSpacing,
} from "./artifacts/types";
import type { Past } from "./history";
import type { NoticeAction, NoticeData } from "./Feedback";
import type { Reply } from "./ReplyButtons";

/**
 * One thing in the conversation: a line from Gala, a line from the visitor
 * (with or without a reference file), the line a card action leaves, Gala's
 * "working" status, or an artifact Gala placed in the stream.
 */
export type StreamItem = (
  | { id: string; kind: "gala"; text: string }
  | { id: string; kind: "visitor"; text: string }
  | { id: string; kind: "working"; text: string }
  | { id: string; kind: "upload"; text: string; fileName: string; sizeLabel: string; imageUrl: string | null }
  | { id: string; kind: "brief"; data: BriefArtifact }
  | { id: string; kind: "research"; data: ResearchArtifact }
  | { id: string; kind: "direction"; data: DirectionArtifact }
  | { id: string; kind: "typeSet"; data: TypeSetArtifact }
  | { id: string; kind: "wordmark"; data: WordmarkArtifact }
  | { id: string; kind: "symbolOpener"; data: SymbolOpenerArtifact }
  | { id: string; kind: "conceptSet"; data: ConceptSetArtifact }
  | { id: string; kind: "variationSet"; data: VariationSetArtifact }
  | { id: string; kind: "stressTest"; data: StressTestArtifact }
  | { id: string; kind: "lockup"; data: LockupArtifact }
  | { id: string; kind: "colorPicker"; data: ColorPickerArtifact }
  | { id: string; kind: "colorwaySet"; data: ColorwaySetArtifact }
  | { id: string; kind: "kit"; data: KitArtifact }
  | { id: string; kind: "picks"; data: PicksArtifact }
  /** A card action's line on the person's side (gala-action-echo). */
  | { id: string; kind: "action"; label: string; state: "Sending" | "Sent" }
  /** Gala's answer when something didn't work (gala-notice). */
  | { id: string; kind: "notice"; notice: NoticeData }
) & {
  /** Set on a card whose step is behind the project: its footer replaces its buttons and chips (history.ts). */
  past?: Past;
  /** The server's message for an action on this card that failed (gala-inline-error), until the next action on it. */
  error?: string;
  /** On the kit card: where each download stands (gala-download-chip). */
  downloads?: Record<string, "idle" | "saving" | "saved" | "couldnt">;
  /** Reply buttons under a Gala line or the symbol opener (gala-reply-buttons), and what each button does. */
  reply?: { view: Reply; primary: ArtifactAction; secondary?: ArtifactAction };
};

/** The artifact kinds, as stored in a message's `kind`. */
export const ARTIFACT_KINDS = [
  "brief",
  "research",
  "direction",
  "typeSet",
  "wordmark",
  "symbolOpener",
  "conceptSet",
  "variationSet",
  "stressTest",
  "lockup",
  "colorPicker",
  "colorwaySet",
  "kit",
  "picks",
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/**
 * What a person did on an artifact. The studio reports it; the engine
 * decides what happens next.
 */
export type ArtifactAction =
  | { type: "editBrief" }
  | { type: "approveDirection" }
  | { type: "changeDirection" }
  | { type: "chooseType"; id: string }
  | { type: "changeType"; id: string }
  | { type: "editType" }
  | { type: "setWordmark"; case?: WordmarkCase; spacing?: WordmarkSpacing }
  | { type: "changeTypeface" }
  | { type: "approveWordmark" }
  | { type: "setLockup"; layout?: LockupLayout; spaceBetween?: LockupSpaceBetween }
  | { type: "changeSymbol" }
  | { type: "approveLockup" }
  | { type: "chooseConcept"; id: string }
  | { type: "chooseVariation"; id: string }
  | { type: "saveColors"; colors: { primary: string; secondary: string; tertiary: string | null } }
  | { type: "editColors" }
  | { type: "chooseColorway"; id: string }
  | { type: "downloadFormat"; format: string }
  | { type: "downloadKit" }
  | { type: "openSpec" }
  | { type: "submitPicks"; hated: { draftId: string; quote: string } | null; loved: { quote: string } | null }
  | { type: "declinePicks" }
  /** "Approve" and "Change something" on the stress test card. */
  | { type: "approveMark" }
  | { type: "changeMark" }
  /** "Go ahead" under the symbol opener. */
  | { type: "goAhead" }
  /** "Yes, redraw" or "No" under a line that offered a move; the offer is stored on the card `cardId` names. */
  | { type: "answerOffer"; answer: "yes" | "no"; cardId: string }
  /** The second dead end's exits: "Back to directions" goes back with the person's description; "Finish in the kit" shows the kit card. */
  | { type: "takeWayOut"; cardId: string }
  | { type: "finishInKit" }
  /** "Back to this step" on a read-only card's footer. */
  | { type: "backToStep" }
  /** A button on one of Gala's notices. */
  | { type: "notice"; action: NoticeAction };
