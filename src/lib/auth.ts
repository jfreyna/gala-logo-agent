import { createAuthClient } from "better-auth/react";
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { config } from "./config";

/**
 * Sign-in is Frilly's. This client talks to Frilly's Better Auth routes from
 * Gala's origin, which Frilly trusts by name. The cross-domain plugin keeps
 * the session in this origin's storage and redeems the one-time token a
 * Google return carries; the convex plugin trades the session for the short
 * token Gala's own Convex project verifies.
 */
export const authClient = createAuthClient({
  baseURL: config.frillySiteUrl,
  plugins: [crossDomainClient(), convexClient()],
});

/**
 * Where a Google sign-in returns to: always this origin's root, built here
 * and never taken from a request, so a link can't steer the return elsewhere.
 */
export function returnAddress(): string {
  return new URL("/", window.location.origin).toString();
}

/**
 * Sign in with an email and password, and stay on Gala.
 *
 * The return address is always sent, and always absolute. Frilly's sign-in
 * fills in a missing or relative one against its own backend address, and
 * the client then follows it, which would leave a signed-in person looking
 * at the backend's root page. An absolute address on this origin is passed
 * through unchanged, so the browser comes back here with the session set.
 */
export function signInWithEmail(email: string, password: string) {
  return authClient.signIn.email({ email, password, callbackURL: returnAddress() });
}
