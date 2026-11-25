import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireOwnProject } from "./lib/owner";

/**
 * A card stores each of its images as a file id, under a key that ends in
 * "FileId" (`markFileId`, `previewFileId`). For the owner, every such key
 * gains a sibling that ends in "Url" with an address the browser can load.
 */
async function withFileAddresses(ctx: QueryCtx, value: unknown): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((entry) => withFileAddresses(ctx, entry)));
  if (value === null || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = await withFileAddresses(ctx, entry);
    if (key.endsWith("FileId") && typeof entry === "string") {
      result[`${key.slice(0, -"FileId".length)}Url`] = await ctx.storage.getUrl(entry as Id<"_storage">);
    }
  }
  return result;
}

/** A project's conversation, oldest first. Owner only. */
export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireOwnProject(ctx, projectId);
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("asc")
      .collect();
    return Promise.all(
      messages.map(async (message) => {
        const upload = message.uploadId ? await ctx.db.get(message.uploadId) : null;
        return {
          _id: message._id,
          _creationTime: message._creationTime,
          author: message.author,
          kind: message.kind,
          text: message.text ?? null,
          artifact: message.artifact === undefined ? null : await withFileAddresses(ctx, message.artifact),
          upload: upload
            ? {
                fileName: upload.fileName,
                contentType: upload.contentType,
                sizeBytes: upload.sizeBytes,
                url: await ctx.storage.getUrl(upload.fileId),
              }
            : null,
        };
      }),
    );
  },
});

/** The longest message a visitor can send. */
const MAX_MESSAGE_LENGTH = 4000;

/**
 * The visitor says something, with or without a reference file attached.
 * Only the visitor's side is written here; Gala's replies are written by the
 * engine.
 */
export const send = mutation({
  args: {
    projectId: v.id("projects"),
    text: v.string(),
    uploadId: v.optional(v.id("uploads")),
  },
  handler: async (ctx, { projectId, text, uploadId }) => {
    const { subject } = await requireOwnProject(ctx, projectId);
    const trimmed = text.trim();
    if (trimmed.length === 0 && uploadId === undefined) {
      throw new ConvexError("Write a message or attach a file.");
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new ConvexError("That message is too long.");
    }
    if (uploadId !== undefined) {
      const upload = await ctx.db.get(uploadId);
      if (upload === null || upload.ownerSubject !== subject || upload.projectId !== projectId) {
        throw new ConvexError("File not found.");
      }
    }
    const messageId = await ctx.db.insert("messages", {
      projectId,
      ownerSubject: subject,
      author: "visitor",
      kind: uploadId === undefined ? "text" : "upload",
      text: trimmed,
      uploadId,
    });
    await ctx.db.patch(projectId, { updatedAt: Date.now(), waitingOnGala: true });
    return messageId;
  },
});
