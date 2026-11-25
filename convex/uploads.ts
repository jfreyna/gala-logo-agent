import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireOwnProject } from "./lib/owner";

/** The largest reference file a person can attach (10 MB). */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** A one-time address the browser sends a reference file to. Owner only. */
export const startUpload = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireOwnProject(ctx, projectId);
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Records a file the browser just stored. The size and type are read from
 * storage, not taken from the browser's word.
 */
export const finishUpload = mutation({
  args: {
    projectId: v.id("projects"),
    fileId: v.id("_storage"),
    fileName: v.string(),
  },
  handler: async (ctx, { projectId, fileId, fileName }) => {
    const { subject } = await requireOwnProject(ctx, projectId);
    const stored = await ctx.db.system.get(fileId);
    if (stored === null) throw new Error("File not found.");
    if (stored.size > MAX_UPLOAD_BYTES) {
      await ctx.storage.delete(fileId);
      throw new Error("That file is too large. The limit is 10 MB.");
    }
    return ctx.db.insert("uploads", {
      ownerSubject: subject,
      projectId,
      fileId,
      fileName: fileName.slice(0, 200),
      contentType: stored.contentType ?? "application/octet-stream",
      sizeBytes: stored.size,
    });
  },
});
