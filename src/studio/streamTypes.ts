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

/**
 * One thing in the conversation: a line from Gala, a line from the visitor
 * (with or without a reference file), Gala's "working" status, or an
 * artifact Gala placed in the stream.
 */
export type StreamItem =
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
  | { id: string; kind: "picks"; data: PicksArtifact };

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
  | { type: "declinePicks" };
