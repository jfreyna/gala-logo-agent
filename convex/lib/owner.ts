import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * The signed-in caller's account, or an error. Every public function starts
 * here: nothing in Gala's storage is readable without a Frilly sign-in.
 */
export async function requireSubject(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new Error("Sign in to continue.");
  return identity.subject;
}

/**
 * The project, only if the caller owns it. A project that does not exist and
 * a project owned by someone else give the same answer, so a caller can't
 * learn which ids are real.
 */
export async function requireOwnProject(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
): Promise<{ subject: string; project: Doc<"projects"> }> {
  const subject = await requireSubject(ctx);
  const project = await ctx.db.get(projectId);
  if (project === null || project.ownerSubject !== subject) {
    throw new Error("Project not found.");
  }
  return { subject, project };
}
