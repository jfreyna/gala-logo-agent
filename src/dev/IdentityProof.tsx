import { useState, type FormEvent } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { authClient, returnAddress, signInWithEmail } from "../lib/auth";
import { config } from "../lib/config";

/**
 * Build check only, not a designed screen: it proves that a Frilly sign-in is
 * accepted by Gala's own Convex project. It is replaced by the real screens.
 */
export function IdentityProof() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const identity = useQuery(api.identity.whoami);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function signInWithPassword(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const result = await signInWithEmail(email, password);
    if (result.error) setError(result.error.message ?? "Sign-in failed");
    setPassword("");
  }

  const expected = config.frillySiteUrl;
  const proven = identity != null && identity.issuer === expected;

  return (
    <main style={{ fontFamily: "ui-monospace, monospace", padding: 24, maxWidth: 720 }}>
      <h1>Gate 1: identity proof</h1>
      <p>Convex auth: {isLoading ? "loading" : isAuthenticated ? "authenticated" : "signed out"}</p>
      <pre data-testid="whoami">{JSON.stringify(identity ?? null, null, 2)}</pre>
      <p data-testid="verdict">
        expected issuer: {expected}
        <br />
        result: {identity === undefined ? "loading" : proven ? "PASS" : identity === null ? "no identity" : "FAIL"}
      </p>
      {!isAuthenticated && (
        <>
          <button
            type="button"
            onClick={() => authClient.signIn.social({ provider: "google", callbackURL: returnAddress() })}
          >
            Continue with Google
          </button>
          <form onSubmit={signInWithPassword} style={{ marginTop: 16, display: "grid", gap: 8, maxWidth: 320 }}>
            <input type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="submit">Sign in with email</button>
          </form>
          {error && <p role="alert">{error}</p>}
        </>
      )}
      {isAuthenticated && (
        <button type="button" onClick={() => authClient.signOut()}>
          Sign out
        </button>
      )}
    </main>
  );
}
