import type { NameLines } from "./nameLines";
/**
 * What each artifact in the chat stream carries. An artifact is a message
 * whose `kind` names one of these, with the matching data in `artifact`.
 * The engine writes them; the studio draws them.
 *
 * Every artifact begins with `say`: the line Gala speaks above the card.
 */

export type Check = { label: string; pass: boolean };

export type BriefArtifact = {
  say: string;
  /** Each field is filled, empty ("None yet"), or still to be asked. */
  brand: string | null;
  tagline: string | null;
  whatYouDo: string | null;
  audience: string | null;
  whereUsed: string[] | null;
  never: string[];
  /** Fields Gala has not asked about yet show "I’ll ask". */
  pending: ("audience" | "whereUsed" | "tagline" | "whatYouDo" | "brand")[];
};

export type Reference = { name: string; note: string; imageUrl: string | null };

export type ResearchArtifact = {
  say: string;
  competitors: Reference[];
  neighbors: Reference[];
};

export type DirectionArtifact = {
  say: string;
  mood: string;
  posture: string;
  energy: string;
  references: string[];
  /** True once the person says it looks right. */
  approved?: boolean;
};

export type Concept = {
  id: string;
  /** "A", "B", "C" for directions; "1", "2", "3" for variations. */
  letter: string;
  name: string;
  rationale: string;
  markUrl: string;
  checks: Check[];
};

export type ConceptSetArtifact = {
  say: string;
  concepts: Concept[];
  /** Drafts Gala drew and set aside, each with the reason. */
  discarded: { id: string; markUrl: string; reason: string }[];
  chosenId: string | null;
};

export type VariationSetArtifact = {
  say: string;
  concepts: Concept[];
  chosenId: string | null;
};

export type TypeDirection = {
  id: string;
  /** "A", "B", "C": the card's letter, used by the type tray ("Change A"). */
  letter: string;
  family: string;
  /** Google's category, as the card writes it: "Serif · Old Style Garalde". */
  category: string;
  /** The family's top mood tags: "Vintage, sincere, rugged". */
  moods: string;
  rationale: string;
  /** Whose favorite this is, if anyone's. */
  pick: "gala" | "person" | null;
};

export type TypeSetArtifact = {
  say: string;
  brandName: string;
  directions: TypeDirection[];
  chosenId: string | null;
  /** True once the choice is saved and the set collapses. */
  saved: boolean;
};

export type WordmarkCase = "asTyped" | "allCaps" | "lowercase";
export type WordmarkSpacing = "tight" | "asDrawn" | "wide";

export type WordmarkArtifact = {
  say: string;
  /** The name as set: its case already applied. */
  brandName: string;
  /** The family chosen in the type step. */
  family: string;
  case: WordmarkCase;
  spacing: WordmarkSpacing;
  /** The letter spacing that goes with `spacing`, in ems. */
  letterSpacingEm: number;
  /** True once the person signs it off; the symbol opens then. */
  approved: boolean;
  /** The weight the name is drawn in (the kit's `info.weight`). Absent on cards from before it was stored: Regular. */
  weight?: number;
} & NameLines;

/** Gala's line that opens the symbol step. It is drawn as a plain message. */
export type SymbolOpenerArtifact = { say: string; ideas?: string[]; answered?: "idea" | "goAhead" | "noSymbol" | null };

export type LockupLayout = "sideBySide" | "stacked";
export type LockupSpaceBetween = "tight" | "asSet" | "wide";

export type LockupArtifact = {
  say: string;
  brandName: string;
  family: string;
  /** The approved wordmark's letter spacing, in ems. */
  letterSpacingEm: number;
  /** The approved symbol: its name, and the mark in black on a clear ground. */
  markName: string;
  markUrl: string;
  layout: LockupLayout;
  spaceBetween: LockupSpaceBetween;
  /** The gap between symbol and name that goes with `spaceBetween`, as a multiple of the standard gap. */
  gapScale: number;
  /** True once the person signs it off; color opens then. */
  approved: boolean;
} & NameLines;

export type StressTestArtifact = {
  say: string;
  brandName: string;
  /** The chosen variation, black on a clear ground. */
  markUrl: string;
  checks: { sixteen: boolean; circle: boolean; inverted: boolean; poster: boolean };
  /** Set when the person approved the mark, typed or with Approve. */
  approved?: boolean;
};

export type BrandColors = { primary: string; secondary: string; tertiary: string | null };

export type ColorPickerArtifact = {
  say: string;
  /** The person's colors as hex, once chosen. */
  colors: BrandColors | null;
  /** True once saved; the card then shows one swatch per role, never a hex. */
  saved: boolean;
};

export type Role = "Primary" | "Secondary" | "Tertiary";

export type Colorway = {
  id: string;
  letter: string;
  name: string;
  rationale: string;
  /** The ground the lock-up sits on (white, or one of the person's colors). */
  ground: string;
  /** The mark, already in this colorway's colors. Absent for a logo of the name alone. */
  markUrl?: string;
  wordmarkColor: string;
  /** The roles this colorway leans on, shown as swatches. */
  roles: Role[];
};

export type ColorwaySetArtifact = {
  say: string;
  brandName: string;
  /** The family chosen in the type step, for the wordmark. */
  family: string;
  /** The approved wordmark's letter spacing, in ems. Absent on a project from before the wordmark step. */
  letterSpacingEm?: number;
  colors: BrandColors;
  colorways: Colorway[];
  chosenId: string | null;
};

export type Lockup = {
  /** "Primary", "Stacked", "Icon", "Wordmark", "All black", "All white". */
  label: string;
  previewUrl: string;
  /** The paper it is shown on: white, black for the all-white variant, or the colorway's ground as a hex when that is a brand color. */
  ground: "white" | "black" | (string & {});
};

export type KitArtifact = {
  say: string;
  lockups: Lockup[];
  /** The kinds of file in the kit, as the chips name them: SVG, EPS, PNG, Square, Social. */
  formats: string[];
};

export type PicksArtifact = {
  say: string;
  /** Every draft Gala showed: directions, set-aside drafts, variations. */
  drafts: { id: string; markUrl: string }[];
  /** The final logo. */
  finalMarkUrl: string;
  /** Set once the person answers, either way. */
  answered: "submitted" | "declined" | null;
};

/** What the person sends from the picks card. Either part may be absent. */
export type PicksSubmission = {
  hated: { draftId: string; quote: string } | null;
  loved: { quote: string } | null;
};
