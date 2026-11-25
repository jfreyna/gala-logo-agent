import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwnProject, requireSubject } from "./lib/owner";
import { TURN_LIFETIME_MS } from "./lib/turn";

/** Gala's first line in every project. */
const OPENING_LINE = "Tell me who you’re building this for, and give me three words you never want associated with your brand. I’ll start there.";


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
      /** Gala's "working" line while a turn runs, or null. */
      working: project.turn !== undefined && Date.now() - project.turn.startedAt < TURN_LIFETIME_MS ? project.turn.status : null,
      /**
       * When the running turn opened, and how long its lock lasts. This
       * answer is not recomputed as time passes, so the studio uses these
       * to stop showing "working" once the lock has run out.
       */
      turnStartedAt: project.turn?.startedAt ?? null,
      turnLifetimeMs: TURN_LIFETIME_MS,
      /** True when the person is owed an answer and no turn is running. */
      waitingOnGala: project.waitingOnGala === true,
    };
  },
});

/** Start a new logo. It opens at the brief, with no name yet. */
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const subject = await requireSubject(ctx);
    const projectId = await ctx.db.insert("projects", {
      ownerSubject: subject,
      brandName: "",
      stage: "brief",
      updatedAt: Date.now(),
    });
    // Gala speaks first. This one line is fixed (it is the studio's design); everything after it comes from the engine.
    await ctx.db.insert("messages", { projectId, ownerSubject: subject, author: "gala", kind: "text", text: OPENING_LINE });
    return projectId;
  },
});
