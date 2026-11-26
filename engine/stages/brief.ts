/**
 * Phase 1, the brief. Gala interviews the person and keeps one brief card
 * up to date. When the brief is complete, research starts in the same turn.
 */
import type { Shape } from "../gemini.ts";
import { WORKING } from "../lines.ts";
import { keptCard, type Outcome, type Turn } from "../turn.ts";

const FIELDS = ["brand", "tagline", "whatYouDo", "audience", "whereUsed"] as const;

type BriefMove = {
  say: string;
  brand: string | null;
  tagline: string | null;
  whatYouDo: string | null;
  audience: string | null;
  whereUsed: string[];
  never: string[];
  stillToAsk: string[];
  complete: boolean;
};

const text = (description: string): Shape => ({ type: "STRING", nullable: true, description });

const SHAPE: Shape = {
  type: "OBJECT",
  properties: {
    say: { type: "STRING", description: "What Gala says above the brief card" },
    brand: text("The brand's name, or null if not given yet"),
    tagline: text("The tagline, or null if there is none"),
    whatYouDo: text("What the brand does, or null if not given yet"),
    audience: text("Who the brand is for, or null if not given yet"),
    whereUsed: { type: "ARRAY", items: { type: "STRING" }, description: "Where the logo will be used; empty if not given yet" },
    never: { type: "ARRAY", items: { type: "STRING" }, description: "Words the brand must never be" },
    stillToAsk: { type: "ARRAY", items: { type: "STRING", enum: [...FIELDS] }, description: "Fields Gala still intends to ask about" },
    complete: { type: "BOOLEAN", description: "True when the brief has enough to start research" },
  },
  required: ["say", "brand", "tagline", "whatYouDo", "audience", "whereUsed", "never", "stillToAsk", "complete"],
};

export async function brief(turn: Turn): Promise<Outcome> {
  if (turn.unanswered().length === 0) return "wait";
  await turn.status(WORKING.brief);
  const images = await turn.attachedImages();
  // References past the limit were never opened: Gala is told which, so it says so and never describes them.
  const notOpened = [...turn.notOpened.values()];
  const moveChecked = await turn.composeCard(
    () =>
      turn.think<BriefMove>({
        section: "brief",
        task:
          "Update the brief from what the person has said, and say what comes next. If a reference image is attached, say what you see in it." +
          (notOpened.length > 0 ? " The references in referencesNotOpened were not opened: say plainly that you didn't open them, and never describe them." : ""),
        facts: { briefSoFar: turn.latest("brief")?.artifact ?? null, ...(notOpened.length > 0 ? { referencesNotOpened: notOpened } : {}) },
        shape: SHAPE,
        images,
      }),
    // The card's fields are the person's own words, so they are judged apart from Gala's line.
    (value) => ({ line: value.say, card: [value.brand ?? "", value.tagline ?? "", value.whatYouDo ?? "", value.audience ?? "", ...value.whereUsed, ...value.never] }),
  );
  if (moveChecked === null) {
    await turn.decline();
    return "wait";
  }
  const move = keptCard(moveChecked, turn.stage);

  // The brief can't be complete without a name and what the brand does, whatever the model says.
  const complete = move.complete && move.brand !== null && move.whatYouDo !== null;
  await turn.write([
    {
      op: "artifact",
      kind: "brief",
      artifact: {
        say: move.say,
        brand: move.brand,
        tagline: move.tagline,
        whatYouDo: move.whatYouDo,
        audience: move.audience,
        whereUsed: move.whereUsed.length > 0 ? move.whereUsed : null,
        never: move.never,
        pending: complete ? [] : move.stillToAsk,
      },
    },
    { op: "project", ...(move.brand !== null ? { brandName: move.brand } : {}), ...(complete ? { stage: "research" as const } : {}) },
  ]);
  return complete ? "continue" : "wait";
}

/** The finished brief, as later steps read it. */
export function briefOf(turn: Turn): Record<string, unknown> {
  const { say: _say, pending: _pending, ...fields } = turn.latest("brief")?.artifact ?? {};
  return fields;
}
