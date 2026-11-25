import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwnProject, requireSubject } from "./lib/owner";

/** The caller's projects, most recently touched first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const subject = await requireSubject(ctx);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_owner_and_updatedAt", (q) => q.eq("ownerSubject", subject))
      .order("desc")
      .collect();
    return Promise.all(
      projects.map(async (project) => ({
        _id: project._id,
        brandName: project.brandName,
        stage: project.stage,
        updatedAt: project.updatedAt,
        latestMarkUrl: project.latestMarkFileId
          ? await ctx.storage.getUrl(project.latestMarkFileId)
          : null,
      })),
    );
  },
});

/** One of the caller's projects. */
export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const { project } = await requireOwnProject(ctx, projectId);
    return {
      _id: project._id,
      brandName: project.brandName,
      stage: project.stage,
      updatedAt: project.updatedAt,
    };
  },
});

/** Start a new logo. It opens at the brief, with no name yet. */
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const subject = await requireSubject(ctx);
    return ctx.db.insert("projects", {
      ownerSubject: subject,
      brandName: "",
      stage: "brief",
      updatedAt: Date.now(),
    });
  },
});
