/**
 * Where Gala's engine finds things. Every address comes from the server's
 * environment; nothing here is a key. The two model gateways are Sprites
 * connectors: they answer only from inside the Sprite and need no auth
 * header, so there is no model key anywhere in this project.
 */

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`Set ${name} in the server's environment (see env.example).`);
  return value.replace(/\/+$/, "");
}

export const config = {
  /** The Sprites connector for Google Gemini. */
  get geminiUrl(): string {
    return required("GALA_GEMINI_URL");
  },
  /** The Sprites connector for TypeSafe (Jev). */
  get typesafeUrl(): string {
    return required("GALA_TYPESAFE_URL");
  },
  /** Gala's storage: the HTTP address of the `frilly-gala` Convex deployment. */
  get storageUrl(): string {
    return required("GALA_CONVEX_SITE_URL");
  },
  /** Shared with `frilly-gala`; proves a call comes from this server. Never logged. */
  get serverSecret(): string | null {
    const value = process.env.GALA_SERVER_SECRET;
    return value === undefined || value === "" ? null : value;
  },

  /** Words, briefs and critique. Thinking is set low: unconstrained, the model spends hundreds of tokens on one sentence. */
  textModel: "gemini-4-neon",
  /**
   * Drawing, cheapest first. The engine starts at the first and moves one
   * step right only after a draft fails its checks twice.
   */
  imageModels: ["gemini-3.1-flash-lite-image", "gemini-3.1-flash-image", "gemini-nano-banana-2.1", "gemini-3-pro-image"],
  /** Choices from a known set, and every yes/no check. */
  jevModel: "jev-latest",
} as const;
