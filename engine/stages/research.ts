/**
 * Phase 1, research and direction. One grounded search finds real
 * competitors and neighbors; Gala then proposes a direction, and waits for
 * the person to approve it or ask for a change.
 */
import type { Shape } from "../gemini.ts";
import { WORKING } from "../lines.ts";
import type { Outcome, Turn } from "../turn.ts";
import { briefOf } from "./brief.ts";

const reference: Shape = {
  type: "OBJECT",
  properties: { name: { type: "STRING" }, note: { type: "STRING", description: "One short sentence on how its logo looks and what that means for this brief" } },
  required: ["name", "note"],
};

const direction: Shape = {
  type: "OBJECT",
  properties: {
    say: { type: "STRING", description: "What Gala says above the direction card" },
    mood: { type: "STRING" },
    posture: { type: "STRING" },
    energy: { type: "STRING" },
    references: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["say", "mood", "posture", "energy", "references"],
};

const RESEARCH_SHAPE: Shape = {
  type: "OBJECT",
  properties: {
    say: { type: "STRING", description: "What Gala says above the research card" },
    competitors: { type: "ARRAY", items: reference, description: "The three competitors most worth showing" },
    neighbors: { type: "ARRAY", items: reference, description: "The three neighboring brands most worth showing" },
    direction,
  },
  required: ["say", "competitors", "neighbors", "direction"],
};

type Reference = { name: string; note: string };
type Direction = { say: string; mood: string; posture: string; energy: string; references: string[] };
type Research = { say: string; competitors: Reference[]; neighbors: Reference[]; direction: Direction };

const directionCard = (value: Direction) => [value.mood, value.posture, value.energy, ...value.references];

export async function research(turn: Turn): Promise<Outcome> {
  const card = turn.latest("direction");
  const fresh = turn.isNewer(card, turn.latest("brief"));

  // First visit: research, then the direction.
  if (!fresh) {
    await turn.status(WORKING.research);
    const found = await turn.compose(
      () =>
        turn.think<Research>({
          section: "research",
          task: "Search for this brand's real competitors and neighbors, then propose the direction.",
          facts: { brief: briefOf(turn) },
          shape: RESEARCH_SHAPE,
          search: true,
        }),
      (value) => ({
        line: `${value.say}\n${value.direction.say}`,
        card: [...[...value.competitors, ...value.neighbors].flatMap((entry) => [entry.name, entry.note]), ...directionCard(value.direction)],
      }),
    );
    if (found === null) {
      await turn.decline();
      return "wait";
    }
    const cards = (list: Reference[]) => list.slice(0, 3).map((entry) => ({ name: entry.name, note: entry.note, imageUrl: null }));
    await turn.write([
      { op: "artifact", kind: "research", artifact: { say: found.say, competitors: cards(found.competitors), neighbors: cards(found.neighbors) } },
      { op: "artifact", kind: "direction", artifact: { ...found.direction, approved: false } },
    ]);
    return "wait";
  }

  if (card!.artifact!.approved === true) {
    await turn.write([{ op: "project", stage: "type" }]);
    return "continue";
  }

  // The person wrote instead of pressing Approve.
  const said = turn.unansweredText();
  if (said === "") return "wait";
  const meaning = await turn.intent(said, {
    approve: "The person accepts the direction as it is",
    change: "The person wants the direction changed",
    other: "The person is asking or saying something else",
  });
  if (meaning === "approve") {
    await turn.write([
      { op: "patchArtifact", messageId: card!.id, artifact: { ...card!.artifact!, approved: true } },
      { op: "project", stage: "type" },
    ]);
    return "continue";
  }
  if (meaning === "change") {
    const revised = await turn.compose(
      () =>
        turn.think<Direction>({
          section: "research",
          task: "Revise the direction as the person asked.",
          facts: { brief: briefOf(turn), research: turn.latest("research")?.artifact ?? null, directionSoFar: card!.artifact },
          shape: direction,
        }),
      (value) => ({ line: value.say, card: directionCard(value) }),
    );
    if (revised === null) await turn.decline();
    else await turn.write([{ op: "artifact", kind: "direction", artifact: { ...revised, approved: false } }]);
    return "wait";
  }
  await turn.converse("the person to approve the direction or ask for a change");
  return "wait";
}

/** The approved direction, as later steps read it. */
export function directionOf(turn: Turn): Record<string, unknown> {
  const { say: _say, approved: _approved, ...fields } = turn.latest("direction")?.artifact ?? {};
  return fields;
}

/** The competitors found, for the "distinct from competitors" check. */
export function competitorsOf(turn: Turn): unknown {
  return (turn.latest("research")?.artifact?.competitors ?? []).map((entry: Reference) => ({ name: entry.name, logo: entry.note }));
}
