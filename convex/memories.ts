import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireSubject } from "./lib/owner";

/** The longest single line of memory. */
const MAX_LINE_LENGTH = 500;

async function requireOwnMemory(
  ctx: MutationCtx,
  memoryId: Id<"memories">,
): Promise<Doc<"memories">> {
  const subject = await requireSubject(ctx);
  const memory = await ctx.db.get(memoryId);
  if (memory === null || memory.ownerSubject !== subject) throw new ConvexError("Line not found.");
  return memory;
}

function cleanLine(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new ConvexError("Write something to remember.");
  if (trimmed.length > MAX_LINE_LENGTH) throw new ConvexError("That line is too long.");
  return trimmed;
}

/** Everything Gala remembers about the caller, oldest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const subject = await requireSubject(ctx);
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_owner", (q) => q.eq("ownerSubject", subject))
      .collect();
    return memories.map((memory) => ({
      _id: memory._id,
      group: memory.group,
      text: memory.text,
      writtenBy: memory.writtenBy,
    }));
  },
});

/** The person adds a line of their own, under the heading the view names. */
export const add = mutation({
  args: { group: v.string(), text: v.string() },
  handler: async (ctx, { group, text }) => {
    const subject = await requireSubject(ctx);
    return ctx.db.insert("memories", {
      ownerSubject: subject,
      group: cleanLine(group),
      text: cleanLine(text),
      writtenBy: "visitor",
      updatedAt: Date.now(),
    });
  },
});

/**
 * The person rewrites a line. The old embedding no longer matches the words,
 * so it is cleared and the line is embedded again later.
 */
export const edit = mutation({
  args: { memoryId: v.id("memories"), text: v.string() },
  handler: async (ctx, { memoryId, text }) => {
    await requireOwnMemory(ctx, memoryId);
    await ctx.db.patch(memoryId, {
      text: cleanLine(text),
      embedding: undefined,
      updatedAt: Date.now(),
    });
  },
});

/** The person removes one line. */
export const remove = mutation({
  args: { memoryId: v.id("memories") },
  handler: async (ctx, { memoryId }) => {
    await requireOwnMemory(ctx, memoryId);
    await ctx.db.delete(memoryId);
  },
});

/** The person clears everything Gala remembers about them. */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const subject = await requireSubject(ctx);
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_owner", (q) => q.eq("ownerSubject", subject))
      .collect();
    await Promise.all(memories.map((memory) => ctx.db.delete(memory._id)));
    return memories.length;
  },
});
