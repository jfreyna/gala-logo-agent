import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOwnProject } from "./lib/owner";

/**
 * What a person does on one of Gala's cards: approve the direction, pick a
 * typeface, sign off the wordmark, pick a mark, sign off the lockup, save
 * colors, send picks to the halls.
 *
 * This is the person's side only. It marks the card and notes that Gala has
 * something to answer; it never writes anything as Gala. A choice is
 * accepted only if it names an option that card really offers, so a crafted
 * call cannot choose a mark Gala did not draw.
 */

/** The longest reason a person can give for a pick. */
const MAX_QUOTE_LENGTH = 280;

type Artifact = Record<string, unknown>;

async function card(ctx: MutationCtx, projectId: Id<"projects">, messageId: Id<"messages">, kind: string): Promise<{ message: Doc<"messages">; artifact: Artifact }> {
  const message = await ctx.db.get(messageId);
  if (message === null || message.projectId !== projectId || message.author !== "gala" || message.kind !== kind) {
    throw new Error("Card not found.");
  }
  return { message, artifact: (message.artifact ?? {}) as Artifact };
}

/**
 * Letter spacing in ems for each Spacing value, and the gap between symbol
 * and name for each Space between value as a multiple of the standard gap.
 * The same numbers as engine/settings.ts, which the kit reads.
 */
const LETTER_SPACING_EM = { tight: -0.02, asDrawn: 0, wide: 0.08 } as const;
const GAP_SCALE = { tight: 0.6, asSet: 1, wide: 1.5 } as const;

/** The name in a case. "As typed" leaves it alone. */
function inCase(name: string, value: "asTyped" | "allCaps" | "lowercase"): string {
  return value === "allCaps" ? name.toUpperCase() : value === "lowercase" ? name.toLowerCase() : name;
}

/** The project's newest type card, where the name as the person had it written lives. */
async function typeCard(ctx: MutationCtx, projectId: Id<"projects">): Promise<Artifact | null> {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .order("desc")
    .collect();
  return (messages.find((message) => message.kind === "typeSet")?.artifact ?? null) as Artifact | null;
}

function nameAsTyped(type: Artifact | null, brandName: string): string {
  return typeof type?.nameAs === "string" ? type.nameAs : brandName;
}

function hasOption(options: unknown, id: string): boolean {
  return Array.isArray(options) && options.some((option) => (option as { id?: unknown }).id === id);
}

/** "#b83a1b" or "#B3A" as "#B83A1B"-style six digits, or an error. */
function hex(value: string): string {
  const match = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim());
  if (match === null) throw new Error("Colors are written as hex, like #B83A1B.");
  const digits = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
  return `#${digits.toUpperCase()}`;
}

function quote(value: string | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > MAX_QUOTE_LENGTH) throw new Error("Keep it to 280 characters.");
  return trimmed;
}

const action = v.union(
  v.object({ type: v.literal("approveDirection") }),
  v.object({ type: v.literal("chooseType"), id: v.string() }),
  v.object({ type: v.literal("editType") }),
  /** "Use for A" in the type tray: a Google family replaces one card's typeface. */
  v.object({ type: v.literal("useFamily"), id: v.string(), family: v.string(), category: v.string(), moods: v.string() }),
  /** "Use this wordmark": the sign-off that opens the symbol. */
  v.object({ type: v.literal("approveWordmark") }),
  /** A Case or Spacing chip on the wordmark card. */
  v.object({
    type: v.literal("setWordmark"),
    case: v.optional(v.union(v.literal("asTyped"), v.literal("allCaps"), v.literal("lowercase"))),
    spacing: v.optional(v.union(v.literal("tight"), v.literal("asDrawn"), v.literal("wide"))),
  }),
  /** "Use this lockup": the sign-off that opens color. */
  v.object({ type: v.literal("approveLockup") }),
  /** A Layout or Space between chip on the lockup card. */
  v.object({
    type: v.literal("setLockup"),
    layout: v.optional(v.union(v.literal("sideBySide"), v.literal("stacked"))),
    spaceBetween: v.optional(v.union(v.literal("tight"), v.literal("asSet"), v.literal("wide"))),
  }),
  v.object({ type: v.literal("chooseConcept"), id: v.string() }),
  v.object({ type: v.literal("chooseVariation"), id: v.string() }),
  v.object({ type: v.literal("saveColors"), primary: v.string(), secondary: v.string(), tertiary: v.union(v.string(), v.null()) }),
  v.object({ type: v.literal("editColors") }),
  v.object({ type: v.literal("chooseColorway"), id: v.string() }),
  v.object({
    type: v.literal("submitPicks"),
    hated: v.union(v.object({ draftId: v.string(), quote: v.string() }), v.null()),
    loved: v.union(v.object({ quote: v.string() }), v.null()),
  }),
  v.object({ type: v.literal("declinePicks") }),
);

export const act = mutation({
  args: { projectId: v.id("projects"), messageId: v.id("messages"), action },
  handler: async (ctx, { projectId, messageId, action }) => {
    const { subject, project } = await requireOwnProject(ctx, projectId);
    /** True when Gala has something to do next. */
    let waitingOnGala = false;

    switch (action.type) {
      case "approveDirection": {
        const { artifact } = await card(ctx, projectId, messageId, "direction");
        await ctx.db.patch(messageId, { artifact: { ...artifact, approved: true } });
        waitingOnGala = project.stage === "research";
        break;
      }
      case "chooseType": {
        const { artifact } = await card(ctx, projectId, messageId, "typeSet");
        if (!hasOption(artifact.directions, action.id)) throw new Error("That typeface is not on the card.");
        await ctx.db.patch(messageId, { artifact: { ...artifact, chosenId: action.id, saved: true } });
        waitingOnGala = project.stage === "type";
        break;
      }
      case "editType": {
        const { artifact } = await card(ctx, projectId, messageId, "typeSet");
        await ctx.db.patch(messageId, { artifact: { ...artifact, saved: false } });
        break;
      }
      case "useFamily": {
        const { artifact } = await card(ctx, projectId, messageId, "typeSet");
        if (!hasOption(artifact.directions, action.id)) throw new Error("That card is not in the set.");
        const directions = (artifact.directions as Artifact[]).map((direction) =>
          direction.id === action.id
            ? { ...direction, family: action.family.slice(0, 80), category: action.category.slice(0, 80), moods: action.moods.slice(0, 120), pick: "person" }
            : direction,
        );
        await ctx.db.patch(messageId, { artifact: { ...artifact, directions } });
        break;
      }
      case "approveWordmark": {
        if (project.stage !== "wordmark") throw new Error("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "wordmark");
        await ctx.db.patch(messageId, { artifact: { ...artifact, approved: true } });
        waitingOnGala = true;
        break;
      }
      case "setWordmark": {
        // A chip changes the card at once; Gala has nothing to answer until the sign-off.
        if (project.stage !== "wordmark") throw new Error("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "wordmark");
        const next = { ...artifact };
        if (action.case !== undefined) {
          next.case = action.case;
          next.brandName = inCase(nameAsTyped(await typeCard(ctx, projectId), project.brandName), action.case);
        }
        if (action.spacing !== undefined) {
          next.spacing = action.spacing;
          next.letterSpacingEm = LETTER_SPACING_EM[action.spacing];
        }
        await ctx.db.patch(messageId, { artifact: next });
        break;
      }
      case "approveLockup": {
        if (project.stage !== "lockup") throw new Error("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "lockup");
        await ctx.db.patch(messageId, { artifact: { ...artifact, approved: true } });
        waitingOnGala = true;
        break;
      }
      case "setLockup": {
        if (project.stage !== "lockup") throw new Error("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "lockup");
        const next = { ...artifact };
        if (action.layout !== undefined) next.layout = action.layout;
        if (action.spaceBetween !== undefined) {
          next.spaceBetween = action.spaceBetween;
          next.gapScale = GAP_SCALE[action.spaceBetween];
        }
        await ctx.db.patch(messageId, { artifact: next });
        break;
      }
      case "chooseConcept":
      case "chooseVariation": {
        const kind = action.type === "chooseConcept" ? "conceptSet" : "variationSet";
        const stage = action.type === "chooseConcept" ? "directions" : "variations";
        if (project.stage !== stage) throw new Error("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, kind);
        if (!hasOption(artifact.concepts, action.id)) throw new Error("That mark is not on the card.");
        await ctx.db.patch(messageId, { artifact: { ...artifact, chosenId: action.id } });
        waitingOnGala = true;
        break;
      }
      case "saveColors": {
        if (project.stage !== "pickColors") throw new Error("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "colorPicker");
        const colors = { primary: hex(action.primary), secondary: hex(action.secondary), tertiary: action.tertiary === null ? null : hex(action.tertiary) };
        await ctx.db.patch(messageId, { artifact: { ...artifact, colors, saved: true } });
        waitingOnGala = true;
        break;
      }
      case "editColors": {
        if (project.stage !== "pickColors" && project.stage !== "colorways") throw new Error("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "colorPicker");
        await ctx.db.patch(messageId, { artifact: { ...artifact, saved: false } });
        await ctx.db.patch(projectId, { stage: "pickColors" });
        break;
      }
      case "chooseColorway": {
        if (project.stage !== "colorways") throw new Error("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "colorwaySet");
        if (!hasOption(artifact.colorways, action.id)) throw new Error("That colorway is not on the card.");
        await ctx.db.patch(messageId, { artifact: { ...artifact, chosenId: action.id } });
        waitingOnGala = true;
        break;
      }
      case "submitPicks": {
        if (project.stage !== "picks") throw new Error("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "picks");
        if (artifact.answered !== null && artifact.answered !== undefined) throw new Error("Your picks are already in.");
        let sent = 0;
        if (action.hated !== null) {
          // Only a draft Gala drew for this project can go to the hall of shame.
          const draft = Array.isArray(artifact.drafts)
            ? (artifact.drafts as { id: string; markFileId: Id<"_storage"> }[]).find((entry) => entry.id === action.hated!.draftId)
            : undefined;
          if (draft === undefined) throw new Error("That draft is not on the card.");
          const text = quote(action.hated.quote);
          await ctx.db.insert("hallSubmissions", { ownerSubject: subject, projectId, hall: "shame", brandName: project.brandName, markFileId: draft.markFileId, quote: text, quoteCheck: "none" });
          sent++;
        }
        if (action.loved !== null) {
          const text = quote(action.loved.quote);
          await ctx.db.insert("hallSubmissions", { ownerSubject: subject, projectId, hall: "fame", brandName: project.brandName, markFileId: artifact.finalMarkFileId as Id<"_storage">, quote: text, quoteCheck: "none" });
          sent++;
        }
        await ctx.db.patch(messageId, { artifact: { ...artifact, answered: sent > 0 ? "submitted" : "declined" } });
        waitingOnGala = true;
        break;
      }
      case "declinePicks": {
        if (project.stage !== "picks") throw new Error("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "picks");
        if (artifact.answered !== null && artifact.answered !== undefined) throw new Error("Your picks are already in.");
        await ctx.db.patch(messageId, { artifact: { ...artifact, answered: "declined" } });
        waitingOnGala = true;
        break;
      }
    }

    await ctx.db.patch(projectId, waitingOnGala ? { waitingOnGala: true, updatedAt: Date.now() } : { updatedAt: Date.now() });
    return { waitingOnGala };
  },
});
