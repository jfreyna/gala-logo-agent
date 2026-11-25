/**
 * The addresses Gala talks to. All are public; none is a secret.
 *
 * - galaConvexUrl: Gala's own Convex project, where projects, chat history,
 *   memory, uploads and kits live.
 * - frillySiteUrl: the HTTP side of the Frilly deployment that signs people
 *   in. It is also the issuer Gala's Convex project trusts.
 * - frillyConvexUrl: the same Frilly deployment's function address, used for
 *   one call only (recording that a new account joined through Gala).
 * - frillyAppUrl: Frilly's own dashboard, where a password is reset. It
 *   changes together with the two Frilly addresses above (dev or production).
 */
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name}. Copy env.example to .env.local.`);
  return value;
}

export const config = {
  galaConvexUrl: required("VITE_CONVEX_URL", import.meta.env.VITE_CONVEX_URL),
  frillySiteUrl: required("VITE_FRILLY_SITE_URL", import.meta.env.VITE_FRILLY_SITE_URL),
  frillyConvexUrl: required("VITE_FRILLY_CONVEX_URL", import.meta.env.VITE_FRILLY_CONVEX_URL),
  frillyAppUrl: required("VITE_FRILLY_APP_URL", import.meta.env.VITE_FRILLY_APP_URL).replace(/\/+$/, ""),
} as const;
