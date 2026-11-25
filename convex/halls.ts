import { query } from "./_generated/server";
import { hall } from "./schema";

/**
 * One hall's entries, newest first, for the front page. This is the only
 * public read in the project: it runs for signed-out visitors, and returns
 * only what a person chose to submit (the mark, the brand name, and the
 * quote when it passed the check). It never returns who submitted it.
 */
export const list = query({
  args: { hall },
  handler: async (ctx, args) => {
    const submissions = await ctx.db
      .query("hallSubmissions")
      .withIndex("by_hall", (q) => q.eq("hall", args.hall))
      .order("desc")
      .collect();
    return Promise.all(
      submissions.map(async (submission) => ({
        _id: submission._id,
        brandName: submission.brandName,
        markUrl: await ctx.storage.getUrl(submission.markFileId),
        quote: submission.quoteCheck === "passed" ? (submission.quote ?? null) : null,
      })),
    );
  },
});
