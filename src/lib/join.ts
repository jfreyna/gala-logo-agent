import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { authClient, returnAddress } from "./auth";
import { config } from "./config";

/**
 * Joining Gala means joining Frilly through its public join entry, named as
 * the source "gala". These are the only three calls Gala makes to Frilly's
 * backend besides sign-in itself, and each is a public route any browser on
 * a trusted origin can call.
 */

export type JoinLinkResult = "sent" | "accountExists" | "invalidEmail" | "failed";

/**
 * Ask Frilly to email a sign-in link. Frilly answers one status; anything
 * else (a rate limit, a network failure, a route that is not live yet)
 * counts as "failed".
 */
export async function requestJoinLink(email: string): Promise<JoinLinkResult> {
  try {
    const response = await fetch(`${config.frillySiteUrl}/join/gala`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "gala" }),
    });
    const body: unknown = await response.json().catch(() => null);
    const status = typeof body === "object" && body !== null && "status" in body ? (body as { status: unknown }).status : null;
    if (status === "sent" || status === "accountExists" || status === "invalidEmail") return status;
    return "failed";
  } catch {
    return "failed";
  }
}

/** A light format check before anything is sent. Frilly makes the real one. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

const GOOGLE_PENDING_KEY = "gala-google-sign-in-pending";

/** Start a Google sign-in. The browser leaves and returns to Gala's root. */
export function continueWithGoogle(): void {
  try {
    sessionStorage.setItem(GOOGLE_PENDING_KEY, "1");
  } catch {
    // Without session storage the sign-in still works; only the label is skipped.
  }
  void authClient.signIn.social({ provider: "google", callbackURL: returnAddress() });
}

const recordJoinEntrySource = makeFunctionReference<"mutation", { source: string }, boolean>("join:recordJoinEntrySource");

/**
 * After a Google sign-in returns, tell Frilly the account came through Gala.
 * Frilly relabels only a brand-new Google account's own record, so calling
 * it for a returning member changes nothing. If it fails, the account is
 * simply counted under "unknown"; nothing is lost, so the error is dropped.
 */
export async function labelGoogleSignUpOnce(): Promise<void> {
  let pending = false;
  try {
    pending = sessionStorage.getItem(GOOGLE_PENDING_KEY) === "1";
    sessionStorage.removeItem(GOOGLE_PENDING_KEY);
  } catch {
    pending = false;
  }
  if (!pending) return;
  try {
    const { data } = await authClient.convex.token();
    if (!data?.token) return;
    const frilly = new ConvexHttpClient(config.frillyConvexUrl);
    frilly.setAuth(data.token);
    await frilly.mutation(recordJoinEntrySource, { source: "gala" });
  } catch {
    // Counted as "unknown" on Frilly's side. Not worth interrupting the person.
  }
}
