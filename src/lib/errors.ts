import { ConvexError } from "convex/values";

/** Said when a call failed and the server gave no words of its own (the connection dropped, say). */
const GENERAL = "That didn’t go through. Check your connection and try again.";

/**
 * The server's own message for a call that failed: the plain sentence a
 * Convex function throws as a ConvexError ("That step is done.", "That line
 * is too long."). Anything else gets a general line, never the internals.
 */
export function messageOf(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  return GENERAL;
}
