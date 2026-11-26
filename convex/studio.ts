import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOwnProject } from "./lib/owner";
import { ECHO_KIND, echoFor } from "./lib/echo";

/**
 * What a person does on one of Gala's cards: approve the direction, pick a
 * typeface, sign off the wordmark, pick a mark, sign off the lockup, save
 * colors, send picks to the halls, finish the first kit download.
 *
 * This is the person's side only. It marks the card, leaves the action's
 * line in the chat on the person's side (lib/echo.ts), and notes that Gala
 * has something to answer; it never writes anything as Gala. A choice is
 * accepted only if it names an option that card really offers, so a crafted
 * call cannot choose a mark Gala did not draw.
 */

/** The longest reason a person can give for a pick. */
const MAX_QUOTE_LENGTH = 280;

type Artifact = Record<string, unknown>;

async function card(ctx: MutationCtx, projectId: Id<"projects">, messageId: Id<"messages">, kind: string): Promise<{ message: Doc<"messages">; artifact: Artifact }> {
  const message = await ctx.db.get(messageId);
  if (message === null || message.projectId !== projectId || message.author !== "gala" || message.kind !== kind) {
    throw new ConvexError("Card not found.");
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
  if (match === null) throw new ConvexError("Colors are written as hex, like #B83A1B.");
  const digits = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
  return `#${digits.toUpperCase()}`;
}

function quote(value: string | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > MAX_QUOTE_LENGTH) throw new ConvexError("Keep it to 280 characters.");
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
  /** The first finished download from the kit (any format, or Download kit): Gala then offers the halls (FRI-1723). */
  v.object({ type: v.literal("kitDownloaded") }),
  /** "Approve" on the stress test card: the same approval a typed one is (FRI-1722). */
  v.object({ type: v.literal("approveMark") }),
  /** "Go ahead" under the symbol opener: the same as saying go ahead (FRI-1722). */
  v.object({ type: v.literal("goAhead") }),
  /** "Yes, redraw" or "No" under the line that offered a move: the answer to the offer stored on this card (FRI-1722). */
  v.object({ type: v.literal("answerOffer"), answer: v.union(v.literal("yes"), v.literal("no")) }),
  /** "Back to directions" under a second dead end's line: the go back with the person's description, as typing it does (FRI-1722). */
  v.object({ type: v.literal("takeWayOut") }),
);

/** The steps whose card can carry an offer, and the card it is stored on (engine/steer.ts `offerCard`). */
const OFFER_CARDS: Record<string, string> = {
  directions: "conceptSet",
  variations: "variationSet",
  lockup: "lockup",
  // After the lockup, the keep-the-symbol offer (FRI-1724) is stored on the approved stress test card.
  pickColors: "stressTest",
  colorways: "stressTest",
  kit: "stressTest",
  picks: "stressTest",
  done: "stressTest",
};

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
        // Once the project is past the type step, the type card is history: a change goes back to the step first (FRI-1713, gap C).
        if (project.stage !== "type") throw new ConvexError("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "typeSet");
        if (!hasOption(artifact.directions, action.id)) throw new ConvexError("That typeface is not on the card.");
        await ctx.db.patch(messageId, { artifact: { ...artifact, chosenId: action.id, saved: true } });
        waitingOnGala = true;
        break;
      }
      case "editType": {
        if (project.stage !== "type") throw new ConvexError("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "typeSet");
        await ctx.db.patch(messageId, { artifact: { ...artifact, saved: false } });
        break;
      }
      case "useFamily": {
        if (project.stage !== "type") throw new ConvexError("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "typeSet");
        if (!hasOption(artifact.directions, action.id)) throw new ConvexError("That card is not in the set.");
        const directions = (artifact.directions as Artifact[]).map((direction) =>
          direction.id === action.id
            ? { ...direction, family: action.family.slice(0, 80), category: action.category.slice(0, 80), moods: action.moods.slice(0, 120), pick: "person" }
            : direction,
        );
        await ctx.db.patch(messageId, { artifact: { ...artifact, directions } });
        break;
      }
      case "approveWordmark": {
        if (project.stage !== "wordmark") throw new ConvexError("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "wordmark");
        await ctx.db.patch(messageId, { artifact: { ...artifact, approved: true } });
        waitingOnGala = true;
        break;
      }
      case "setWordmark": {
        // A chip changes the card at once; Gala has nothing to answer until the sign-off.
        if (project.stage !== "wordmark") throw new ConvexError("That step is done.");
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
        if (project.stage !== "lockup") throw new ConvexError("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "lockup");
        await ctx.db.patch(messageId, { artifact: { ...artifact, approved: true } });
        waitingOnGala = true;
        break;
      }
      case "setLockup": {
        if (project.stage !== "lockup") throw new ConvexError("That step is done.");
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
        if (project.stage !== stage) throw new ConvexError("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, kind);
        if (!hasOption(artifact.concepts, action.id)) throw new ConvexError("That mark is not on the card.");
        await ctx.db.patch(messageId, { artifact: { ...artifact, chosenId: action.id } });
        waitingOnGala = true;
        break;
      }
      case "saveColors": {
        if (project.stage !== "pickColors") throw new ConvexError("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "colorPicker");
        const colors = { primary: hex(action.primary), secondary: hex(action.secondary), tertiary: action.tertiary === null ? null : hex(action.tertiary) };
        await ctx.db.patch(messageId, { artifact: { ...artifact, colors, saved: true } });
        waitingOnGala = true;
        break;
      }
      case "editColors": {
        if (project.stage !== "pickColors" && project.stage !== "colorways") throw new ConvexError("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "colorPicker");
        await ctx.db.patch(messageId, { artifact: { ...artifact, saved: false } });
        await ctx.db.patch(projectId, { stage: "pickColors" });
        break;
      }
      case "chooseColorway": {
        if (project.stage !== "colorways") throw new ConvexError("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "colorwaySet");
        if (!hasOption(artifact.colorways, action.id)) throw new ConvexError("That colorway is not on the card.");
        await ctx.db.patch(messageId, { artifact: { ...artifact, chosenId: action.id } });
        waitingOnGala = true;
        break;
      }
      case "submitPicks": {
        if (project.stage !== "picks") throw new ConvexError("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "picks");
        if (artifact.answered !== null && artifact.answered !== undefined) throw new ConvexError("Your picks are already in.");
        let sent = 0;
        if (action.hated !== null) {
          // Only a draft Gala drew for this project can go to the hall of shame.
          const draft = Array.isArray(artifact.drafts)
            ? (artifact.drafts as { id: string; markFileId: Id<"_storage"> }[]).find((entry) => entry.id === action.hated!.draftId)
            : undefined;
          if (draft === undefined) throw new ConvexError("That draft is not on the card.");
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
        if (project.stage !== "picks") throw new ConvexError("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "picks");
        if (artifact.answered !== null && artifact.answered !== undefined) throw new ConvexError("Your picks are already in.");
        await ctx.db.patch(messageId, { artifact: { ...artifact, answered: "declined" } });
        waitingOnGala = true;
        break;
      }
      case "approveMark": {
        if (project.stage !== "stressTest") throw new ConvexError("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "stressTest");
        await ctx.db.patch(messageId, { artifact: { ...artifact, approved: true } });
        waitingOnGala = true;
        break;
      }
      case "goAhead": {
        if (project.stage !== "symbolOpener") throw new ConvexError("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, "symbolOpener");
        if (artifact.answered !== null && artifact.answered !== undefined) throw new ConvexError("That step is done.");
        await ctx.db.patch(messageId, { artifact: { ...artifact, answered: "goAhead" } });
        waitingOnGala = true;
        break;
      }
      case "answerOffer": {
        // Only an offer still standing: Gala has written nothing since the line that made it, and it has no answer yet.
        const kind = OFFER_CARDS[project.stage];
        if (kind === undefined) throw new ConvexError("That step is done.");
        const { artifact } = await card(ctx, projectId, messageId, kind);
        const offer = artifact.offer as { afterMessages: number; pressed?: string } | null | undefined;
        if (offer === null || offer === undefined || offer.pressed !== undefined) throw new ConvexError("That question has its answer.");
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .order("asc")
          .collect();
        if (messages.slice(offer.afterMessages + 1).some((message) => message.author === "gala")) throw new ConvexError("That question has its answer.");
        await ctx.db.patch(messageId, { artifact: { ...artifact, offer: { ...offer, pressed: action.answer } } });
        waitingOnGala = true;
        break;
      }
      case "takeWayOut": {
        // Only the newest exits on this card, unanswered, with nothing Gala wrote after the line they sit under.
        const message = await ctx.db.get(messageId);
        if (message === null || message.projectId !== projectId || message.author !== "gala") throw new ConvexError("Card not found.");
        const artifact = (message.artifact ?? {}) as Artifact;
        const exits = Array.isArray(artifact.exits) ? (artifact.exits as { afterMessages: number; pressed?: string; answered?: boolean }[]) : [];
        const newest = exits[exits.length - 1];
        if (newest === undefined || newest.pressed !== undefined || newest.answered === true) throw new ConvexError("That question has its answer.");
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .order("asc")
          .collect();
        if (messages.slice(newest.afterMessages + 1).some((later) => later.author === "gala")) throw new ConvexError("That question has its answer.");
        await ctx.db.patch(messageId, { artifact: { ...artifact, exits: [...exits.slice(0, -1), { ...newest, pressed: "directions" }] } });
        waitingOnGala = true;
        break;
      }
      case "kitDownloaded": {
        // Only the first one counts, and only while the project waits at the picks step. Any other download is
        // the person saving files again: nothing to record, no one to wake, and no error under the card.
        const { artifact } = await card(ctx, projectId, messageId, "kit");
        if (project.stage !== "picks" || artifact.downloaded === true) break;
        await ctx.db.patch(messageId, { artifact: { ...artifact, downloaded: true } });
        waitingOnGala = true;
        break;
      }
    }

    // The action's line in the chat, on the person's side. It has no text, so steering never reads it as something the person said.
    const echo = echoFor(action, ((await ctx.db.get(messageId))?.artifact ?? null) as Record<string, unknown> | null);
    if (echo !== null) {
      await ctx.db.insert("messages", { projectId, ownerSubject: subject, author: "visitor", kind: ECHO_KIND, artifact: { ...echo, wakes: waitingOnGala } });
    }

    await ctx.db.patch(projectId, waitingOnGala ? { waitingOnGala: true, updatedAt: Date.now() } : { updatedAt: Date.now() });
    return { waitingOnGala };
  },
});
