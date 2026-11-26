import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireOwnProject } from "./lib/owner";

/** The largest reference file a person can attach (10 MB). */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * How recently a file must have been stored to be recorded as an upload.
 * The page records a file the moment the storage service has it, so a real
 * upload is seconds old; ten minutes leaves room for a slow connection and a
 * retry. Any file stored earlier (another account's reference, a drawn mark,
 * a kit file) can't be claimed this way, even by someone who learned its id.
 * This narrows what a named file can be, but doesn't tie a file to the
 * person who stored it: nothing records who asked for an upload address.
 */
const FRESH_UPLOAD_MS = 10 * 60 * 1000;

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
 * storage, not taken from the browser's word. Only a file stored in the last
 * few minutes (FRESH_UPLOAD_MS), and not already recorded on this project,
 * is accepted. A file that is never recorded can't be used anywhere: the
 * uploads row is the only way a person's file reaches a message or Gala.
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
    if (stored === null || Date.now() - stored._creationTime > FRESH_UPLOAD_MS) throw new ConvexError("File not found.");
    const recorded = await ctx.db
      .query("uploads")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    if (recorded.some((upload) => upload.fileId === fileId)) throw new ConvexError("File not found.");
    if (stored.size > MAX_UPLOAD_BYTES) {
      await ctx.storage.delete(fileId);
      throw new ConvexError("That file is too large. The limit is 10 MB.");
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
