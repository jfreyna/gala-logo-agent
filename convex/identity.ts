import { query } from "./_generated/server";

/**
 * Who the caller is, as this project sees them.
 *
 * Returns null for a signed-out caller. It reports only the caller's own
 * token claims back to the caller, so it reveals nothing about anyone else.
 */
export const whoami = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    return {
      issuer: identity.issuer,
      subject: identity.subject,
      email: identity.email ?? null,
      name: identity.name ?? null,
    };
  },
});
