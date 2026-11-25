/**
 * Gala has no accounts of its own. A person signs in with their Frilly
 * account, and this project trusts the tokens Frilly's sign-in issues.
 *
 * FRILLY_ISSUER is the one value that names which Frilly deployment that is.
 * Convex reads the issuer's public OIDC discovery document and key set, so no
 * key of Frilly's is stored here or on the Sprite.
 */
export default {
  providers: [
    {
      domain: process.env.FRILLY_ISSUER!,
      applicationID: "convex",
    },
  ],
};
