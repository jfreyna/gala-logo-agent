import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Gala's storage. Every row belongs to one Frilly account, named by the
 * `subject` claim of that account's sign-in token (`ownerSubject`). Functions
 * read the caller's identity and compare it with the row's owner before
 * returning or changing anything; see convex/lib/owner.ts.
 */

/** Where a project stands, in the order the work runs. */
export const stage = v.union(
  v.literal("brief"),
  v.literal("research"),
  v.literal("type"),
  v.literal("wordmark"),
  v.literal("symbolOpener"),
  v.literal("directions"),
  v.literal("variations"),
  v.literal("stressTest"),
  v.literal("lockup"),
  v.literal("pickColors"),
  v.literal("colorways"),
  v.literal("kit"),
  v.literal("picks"),
  v.literal("done"),
);

/** Who wrote a message in the conversation. */
export const author = v.union(v.literal("visitor"), v.literal("gala"));

/** The two halls on the front page. */
export const hall = v.union(v.literal("fame"), v.literal("shame"));

export default defineSchema({
  /** One brand's logo project. */
  projects: defineTable({
    ownerSubject: v.string(),
    /** The brand's name; empty until the brief gives one. */
    brandName: v.string(),
    stage,
    /** The latest mark, shown on the project's card. Absent before any draft. */
    latestMarkFileId: v.optional(v.id("_storage")),
    /** Last time anything in the project changed (ms since epoch). */
    updatedAt: v.number(),
    /**
     * Set while Gala's server is working on this project. It is the lock
     * that keeps turns one at a time, and `status` is the "working" line the
     * studio shows. A turn that died leaves it behind; it expires by age.
     */
    turn: v.optional(v.object({ id: v.string(), startedAt: v.number(), status: v.string() })),
    /** The person did something Gala has not answered yet. */
    waitingOnGala: v.optional(v.boolean()),
    /**
     * Requests the person made ahead of their step, each kept for that step
     * in their own words. Gala does not act on one where it was said; the
     * step reads it when it opens. They live on the project, not on a card,
     * so going back to an earlier step does not lose them.
     */
    heldIdeas: v.optional(v.array(v.object({ step: stage, text: v.string() }))),
  }).index("by_owner_and_updatedAt", ["ownerSubject", "updatedAt"]),

  /**
   * The chat stream, in order. A message is plain text, or an artifact Gala
   * placed in the stream (a brief card, three directions, a kit and so on).
   */
  messages: defineTable({
    projectId: v.id("projects"),
    ownerSubject: v.string(),
    author,
    /** "text", or the name of the artifact this message carries. */
    kind: v.string(),
    text: v.optional(v.string()),
    /** The artifact's data. Its shape per kind is owned by the engine. */
    artifact: v.optional(v.any()),
    /** Set when the visitor's message carries a reference file. */
    uploadId: v.optional(v.id("uploads")),
  }).index("by_project", ["projectId"]),

  /** What the person picked and set aside at each step. */
  phaseChoices: defineTable({
    projectId: v.id("projects"),
    ownerSubject: v.string(),
    /** The step the choice belongs to, a `stage` value. */
    step: stage,
    /** The option kept. Absent while the step is still open. */
    chosen: v.optional(v.string()),
    /** Options shown and not kept, drafts Gala rejected included. */
    discarded: v.array(v.string()),
    /** The message that showed the options. */
    messageId: v.optional(v.id("messages")),
  }).index("by_project_and_step", ["projectId", "step"]),

  /**
   * Lines Gala remembers about a person across projects. The person can
   * read, edit and remove every line.
   */
  memories: defineTable({
    ownerSubject: v.string(),
    /** The project a line came from, when it came from one. */
    projectId: v.optional(v.id("projects")),
    /** The heading the line sits under in the Memory view. */
    group: v.string(),
    text: v.string(),
    /** Who wrote the line: Gala, or the person adding their own. */
    writtenBy: author,
    /** Absent until the line has been embedded. */
    embedding: v.optional(v.array(v.float64())),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerSubject"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 768,
      filterFields: ["ownerSubject"],
    }),

  /** Reference files a person attached in the chat. */
  uploads: defineTable({
    ownerSubject: v.string(),
    projectId: v.id("projects"),
    fileId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
  }).index("by_project", ["projectId"]),

  /** A finished kit: its files, and the data behind the spec sheet. */
  kits: defineTable({
    ownerSubject: v.string(),
    projectId: v.id("projects"),
    files: v.array(
      v.object({
        /** What the file is, for example "Primary lock-up". */
        label: v.string(),
        fileName: v.string(),
        contentType: v.string(),
        fileId: v.id("_storage"),
      }),
    ),
    /**
     * What each format chip and "Download kit" hands over: a zip per file
     * format, the square, the social image, and one zip of everything.
     */
    downloads: v.optional(
      v.array(
        v.object({
          /** "SVG", "EPS", "PNG", "Square", "Social" or "Kit". */
          label: v.string(),
          fileName: v.string(),
          contentType: v.string(),
          fileId: v.id("_storage"),
        }),
      ),
    ),
    /** Clear space, minimum sizes, type and color ladders. */
    spec: v.any(),
  }).index("by_project", ["projectId"]),

  /**
   * Picks a person chose to send to the halls. Nothing lands here unless
   * they press Submit my picks.
   */
  hallSubmissions: defineTable({
    ownerSubject: v.string(),
    projectId: v.id("projects"),
    hall,
    brandName: v.string(),
    /** The mark as SVG, shown tinted in the hall and in color on hover. */
    markFileId: v.id("_storage"),
    /** Up to 280 characters. Dropped when the check fails. */
    quote: v.optional(v.string()),
    /** "none" when no quote was written. */
    quoteCheck: v.union(v.literal("none"), v.literal("passed"), v.literal("failed")),
  })
    .index("by_hall", ["hall"])
    .index("by_project", ["projectId"]),
});
