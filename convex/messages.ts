import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwnProject } from "./lib/owner";

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
          artifact: message.artifact ?? null,
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
      throw new Error("Write a message or attach a file.");
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new Error("That message is too long.");
    }
    if (uploadId !== undefined) {
      const upload = await ctx.db.get(uploadId);
      if (upload === null || upload.ownerSubject !== subject || upload.projectId !== projectId) {
        throw new Error("File not found.");
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
    await ctx.db.patch(projectId, { updatedAt: Date.now() });
    return messageId;
  },
});
