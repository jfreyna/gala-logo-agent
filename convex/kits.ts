import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireOwnProject } from "./lib/owner";

/**
 * A project's finished kit, with a download address per file. Owner only:
 * the addresses are made for the signed-in owner and no one else is told
 * the kit exists.
 */
export const forProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireOwnProject(ctx, projectId);
    const kit = await ctx.db
      .query("kits")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .first();
    if (kit === null) return null;
    return {
      _id: kit._id,
      spec: kit.spec,
      /** What each format chip and "Download kit" hands over. */
      downloads: await Promise.all(
        (kit.downloads ?? []).map(async (file) => ({
          label: file.label,
          fileName: file.fileName,
          contentType: file.contentType,
          url: await ctx.storage.getUrl(file.fileId),
        })),
      ),
      files: await Promise.all(
        kit.files.map(async (file) => ({
          label: file.label,
          fileName: file.fileName,
          contentType: file.contentType,
          url: await ctx.storage.getUrl(file.fileId),
        })),
      ),
    };
  },
});
