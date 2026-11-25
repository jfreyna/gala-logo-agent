import { query } from "./_generated/server";
import { hall } from "./schema";

/**
 * One hall's entries, newest first, for the front page. This is the only
 * public read in the project: it runs for signed-out visitors, and returns
 * only what a person chose to submit (the mark, the brand name, and the
 * quote when it passed the check). It never returns who submitted it.
 *
 * Until launch the halls are quiet: while GALA_HALLS_OPEN is not "true",
 * only picks from the account named in GALA_HALLS_PREVIEW_OWNER show (the
 * run in which Gala designed Gala's own logo). Opening the halls is one
 * environment value, set by the founder.
 */
export const list = query({
  args: { hall },
  handler: async (ctx, args) => {
    const submissions = await ctx.db
      .query("hallSubmissions")
      .withIndex("by_hall", (q) => q.eq("hall", args.hall))
      .order("desc")
      .collect();
    const open = process.env.GALA_HALLS_OPEN === "true";
    const previewOwner = process.env.GALA_HALLS_PREVIEW_OWNER;
    const shown = open ? submissions : submissions.filter((submission) => previewOwner !== undefined && submission.ownerSubject === previewOwner);
    return Promise.all(
      shown.map(async (submission) => ({
        _id: submission._id,
        brandName: submission.brandName,
        markUrl: await ctx.storage.getUrl(submission.markFileId),
        quote: submission.quoteCheck === "passed" ? (submission.quote ?? null) : null,
      })),
    );
  },
});
