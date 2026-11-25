import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { TURN_LIFETIME_MS } from "./lib/turn";
import { stage } from "./schema";

/**
 * What Gala's server may do in storage. Every function here is internal: a
 * browser cannot call it. Each is reached through an HTTP route in
 * convex/http.ts, which has already checked the Sprite's shared secret (the
 * caller is Gala's server).
 *
 * A turn is one stretch of Gala's work on one project.
 *   - `begin` opens it. The route also requires the person's own sign-in
 *     token, and passes its `subject` here: only the project's owner can
 *     open a turn. It takes the project's lock under a turn id that Gala's
 *     server made at random.
 *   - `read`, `write` and `end` run inside it. They take the turn id in
 *     place of the token. The id works only on the project whose lock holds
 *     it, and only until the lock is released or runs out, so a turn cannot
 *     reach another project and cannot die halfway because a token expired.
 */

/**
 * The project an id names, or null. The id arrives from outside as text; one
 * that is not a project id at all is answered like one that names nothing.
 */
async function projectNamed(ctx: QueryCtx | MutationCtx, projectId: string): Promise<Doc<"projects"> | null> {
  const id = ctx.db.normalizeId("projects", projectId);
  return id === null ? null : ctx.db.get(id);
}

async function ownProject(ctx: QueryCtx | MutationCtx, subject: string, projectId: string): Promise<Doc<"projects">> {
  const project = await projectNamed(ctx, projectId);
  if (project === null || project.ownerSubject !== subject) throw new Error("Project not found.");
  return project;
}

/** True while `turnId` holds the project's lock and the lock has not run out. */
function holdsLock(project: Doc<"projects"> | null, turnId: string): project is Doc<"projects"> {
  return project !== null && project.turn !== undefined && project.turn.id === turnId && Date.now() - project.turn.startedAt < TURN_LIFETIME_MS;
}

/**
 * The project a turn was opened on, only while that turn holds its lock. A
 * project that does not exist, a wrong id and a lock that ran out all give
 * the same answer.
 */
async function ownTurn(ctx: QueryCtx | MutationCtx, projectId: string, turnId: string): Promise<Doc<"projects">> {
  const project = await projectNamed(ctx, projectId);
  if (!holdsLock(project, turnId)) throw new Error("This turn is over.");
  return project;
}

/** Everything Gala needs to know about a project. */
async function projectContext(ctx: QueryCtx | MutationCtx, project: Doc<"projects">) {
  const projectId = project._id;
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .order("asc")
    .collect();
  const uploads = await ctx.db
    .query("uploads")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  const uploadsById = new Map(uploads.map((upload) => [upload._id, upload]));
  const choices = await ctx.db
    .query("phaseChoices")
    .withIndex("by_project_and_step", (q) => q.eq("projectId", projectId))
    .collect();
  const memories = await ctx.db
    .query("memories")
    .withIndex("by_owner", (q) => q.eq("ownerSubject", project.ownerSubject))
    .collect();
  const submissions = await ctx.db
    .query("hallSubmissions")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();

  return {
    project: { id: project._id, brandName: project.brandName, stage: project.stage },
    messages: messages.map((message) => {
      const upload = message.uploadId ? uploadsById.get(message.uploadId) : undefined;
      return {
        id: message._id,
        author: message.author,
        kind: message.kind,
        text: message.text ?? null,
        artifact: message.artifact ?? null,
        upload: upload ? { fileId: upload.fileId, fileName: upload.fileName, contentType: upload.contentType } : null,
      };
    }),
    choices: choices.map((choice) => ({ step: choice.step, chosen: choice.chosen ?? null, discarded: choice.discarded })),
    memory: memories.map((memory) => ({ id: memory._id, group: memory.group, text: memory.text, writtenBy: memory.writtenBy })),
    // Quotes sent to the halls that have not been checked yet.
    quotesToCheck: submissions
      .filter((submission) => submission.quote !== undefined && submission.quoteCheck === "none")
      .map((submission) => ({ id: submission._id, hall: submission.hall, quote: submission.quote as string })),
  };
}

/**
 * Opens a turn and returns everything Gala needs to know about the project.
 * `busy` means another turn holds the lock, and nothing was taken.
 */
export const begin = internalMutation({
  args: { subject: v.string(), projectId: v.string(), turnId: v.string() },
  handler: async (ctx, { subject, projectId, turnId }) => {
    const project = await ownProject(ctx, subject, projectId);
    const now = Date.now();
    if (project.turn !== undefined && project.turn.id !== turnId && now - project.turn.startedAt < TURN_LIFETIME_MS) {
      return { busy: true as const };
    }
    await ctx.db.patch(project._id, { turn: { id: turnId, startedAt: now, status: "" } });
    return { busy: false as const, ...(await projectContext(ctx, project)) };
  },
});

/** Reads the project again inside a turn, between Gala's steps. */
export const read = internalQuery({
  args: { projectId: v.string(), turnId: v.string() },
  handler: async (ctx, { projectId, turnId }) => {
    return { busy: false as const, ...(await projectContext(ctx, await ownTurn(ctx, projectId, turnId))) };
  },
});

/** Whether a turn holds a project's lock right now. The file routes ask before storing or reading a file. */
export const holds = internalQuery({
  args: { projectId: v.string(), turnId: v.string() },
  handler: async (ctx, { projectId, turnId }) => holdsLock(await projectNamed(ctx, projectId), turnId),
});

/** Whether a person owns a project. Asked before a turn is stopped at their request. */
export const owns = internalQuery({
  args: { subject: v.string(), projectId: v.string() },
  handler: async (ctx, { subject, projectId }) => {
    const project = await projectNamed(ctx, projectId);
    return project !== null && project.ownerSubject === subject;
  },
});

const kitFile = v.object({ label: v.string(), fileName: v.string(), contentType: v.string(), fileId: v.id("_storage") });

/** One thing Gala's server writes. A `write` call applies a list of these together. */
const operation = v.union(
  /** A line from Gala. */
  v.object({ op: v.literal("say"), text: v.string() }),
  /** A card in the stream. `ref` lets later operations in the same call name its message. */
  v.object({ op: v.literal("artifact"), kind: v.string(), artifact: v.any(), ref: v.optional(v.string()) }),
  /** Replace the data of a card already in the stream. */
  v.object({ op: v.literal("patchArtifact"), messageId: v.id("messages"), artifact: v.any() }),
  /** The "working" line shown while the turn runs. */
  v.object({ op: v.literal("status"), text: v.string() }),
  v.object({
    op: v.literal("project"),
    brandName: v.optional(v.string()),
    stage: v.optional(stage),
    latestMarkFileId: v.optional(v.id("_storage")),
  }),
  /** What was kept and set aside at a step. */
  v.object({
    op: v.literal("choice"),
    step: stage,
    chosen: v.optional(v.string()),
    discarded: v.array(v.string()),
    messageRef: v.optional(v.string()),
  }),
  /** A line of memory about the person. */
  v.object({ op: v.literal("remember"), group: v.string(), text: v.string() }),
  v.object({ op: v.literal("kit"), files: v.array(kitFile), downloads: v.array(kitFile), spec: v.any() }),
  /** The result of a quote's check. A failed check drops the quote and keeps the logo. */
  v.object({ op: v.literal("quoteChecked"), submissionId: v.id("hallSubmissions"), passed: v.boolean() }),
);

/**
 * Records what Gala made during a turn. Refused once the turn is over.
 * Everything is written to the turn's own project, for that project's
 * owner: neither is taken from the caller.
 */
export const write = internalMutation({
  args: { projectId: v.string(), turnId: v.string(), operations: v.array(operation) },
  handler: async (ctx, args) => {
    const { turnId, operations } = args;
    const project = await ownTurn(ctx, args.projectId, turnId);
    const projectId = project._id;
    const subject = project.ownerSubject;
    const refs = new Map<string, Id<"messages">>();
    const written: Id<"messages">[] = [];

    for (const item of operations) {
      switch (item.op) {
        case "say": {
          written.push(await ctx.db.insert("messages", { projectId, ownerSubject: subject, author: "gala", kind: "text", text: item.text }));
          break;
        }
        case "artifact": {
          const id = await ctx.db.insert("messages", { projectId, ownerSubject: subject, author: "gala", kind: item.kind, artifact: item.artifact });
          if (item.ref !== undefined) refs.set(item.ref, id);
          written.push(id);
          break;
        }
        case "patchArtifact": {
          const message = await ctx.db.get(item.messageId);
          if (message === null || message.projectId !== projectId || message.author !== "gala") throw new Error("Card not found.");
          await ctx.db.patch(item.messageId, { artifact: item.artifact });
          break;
        }
        case "status": {
          await ctx.db.patch(projectId, { turn: { ...project.turn!, status: item.text } });
          break;
        }
        case "project": {
          const patch: Partial<Doc<"projects">> = {};
          if (item.brandName !== undefined) patch.brandName = item.brandName.slice(0, 60);
          if (item.stage !== undefined) patch.stage = item.stage;
          if (item.latestMarkFileId !== undefined) patch.latestMarkFileId = item.latestMarkFileId;
          await ctx.db.patch(projectId, patch);
          break;
        }
        case "choice": {
          const existing = await ctx.db
            .query("phaseChoices")
            .withIndex("by_project_and_step", (q) => q.eq("projectId", projectId).eq("step", item.step))
            .first();
          const messageId = item.messageRef !== undefined ? refs.get(item.messageRef) : undefined;
          if (existing === null) {
            await ctx.db.insert("phaseChoices", { projectId, ownerSubject: subject, step: item.step, chosen: item.chosen, discarded: item.discarded, messageId });
          } else {
            await ctx.db.patch(existing._id, { chosen: item.chosen, discarded: item.discarded, messageId: messageId ?? existing.messageId });
          }
          break;
        }
        case "remember": {
          const lines = await ctx.db
            .query("memories")
            .withIndex("by_owner", (q) => q.eq("ownerSubject", subject))
            .collect();
          if (!lines.some((line) => line.text === item.text)) {
            await ctx.db.insert("memories", { ownerSubject: subject, projectId, group: item.group, text: item.text.slice(0, 500), writtenBy: "gala", updatedAt: Date.now() });
          }
          break;
        }
        case "kit": {
          const earlier = await ctx.db
            .query("kits")
            .withIndex("by_project", (q) => q.eq("projectId", projectId))
            .collect();
          for (const kit of earlier) await ctx.db.delete(kit._id);
          await ctx.db.insert("kits", { ownerSubject: subject, projectId, files: item.files, downloads: item.downloads, spec: item.spec });
          break;
        }
        case "quoteChecked": {
          const submission = await ctx.db.get(item.submissionId);
          if (submission === null || submission.projectId !== projectId) throw new Error("Pick not found.");
          await ctx.db.patch(item.submissionId, item.passed ? { quoteCheck: "passed" } : { quoteCheck: "failed", quote: undefined });
          break;
        }
      }
    }
    await ctx.db.patch(projectId, { updatedAt: Date.now() });
    return { written };
  },
});

/**
 * Closes a turn: the lock is released and the project no longer waits on
 * Gala. A turn that no longer holds the lock has nothing to release, and
 * that is not an error: closing always goes through.
 */
export const end = internalMutation({
  args: { projectId: v.string(), turnId: v.string() },
  handler: async (ctx, { projectId, turnId }) => {
    const project = await projectNamed(ctx, projectId);
    if (project === null || project.turn === undefined || project.turn.id !== turnId) return { released: false };
    await ctx.db.patch(project._id, { turn: undefined, waitingOnGala: false, updatedAt: Date.now() });
    return { released: true };
  },
});

/**
 * Files a line the person added to memory under the heading it belongs to.
 * It runs outside a turn: the person can edit memory at any time.
 */
export const fileMemory = internalMutation({
  args: { subject: v.string(), memoryId: v.id("memories"), group: v.string() },
  handler: async (ctx, { subject, memoryId, group }) => {
    const line = await ctx.db.get(memoryId);
    if (line === null || line.ownerSubject !== subject) throw new Error("Line not found.");
    await ctx.db.patch(memoryId, { group });
    return { text: line.text };
  },
});
