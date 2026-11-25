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

export type StressTestArtifact = {
  say: string;
  brandName: string;
  /** The chosen variation, black on a clear ground. */
  markUrl: string;
  checks: { sixteen: boolean; circle: boolean; inverted: boolean; poster: boolean };
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
  /** The mark, already in this colorway's colors. */
  markUrl: string;
  wordmarkColor: string;
  /** The two roles this colorway leans on, shown as swatches. */
  roles: [Role, Role];
};

export type ColorwaySetArtifact = {
  say: string;
  brandName: string;
  /** The family chosen in the type step, for the wordmark. */
  family: string;
  colors: BrandColors;
  colorways: Colorway[];
  chosenId: string | null;
};

export type Lockup = {
  /** "Primary", "Stacked", "Icon", "Wordmark", "All black", "All white". */
  label: string;
  previewUrl: string;
  /** The paper it is shown on: white, or black for the all-white variant. */
  ground: "white" | "black";
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
