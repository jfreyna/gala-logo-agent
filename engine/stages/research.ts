/**
 * Phase 1, research and direction. One grounded search finds real
 * competitors and neighbors; Gala then proposes a direction, and waits for
 * the person to approve it or ask for a change.
 */
import type { Image, Shape } from "../gemini.ts";
import { forJudging, siteIcon } from "../siteIcon.ts";
import { declineLine, WORKING } from "../lines.ts";
import { asked, requestsOf, type Outcome, type Turn } from "../turn.ts";
import { briefOf } from "./brief.ts";

const reference: Shape = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    site: { type: "STRING", nullable: true, description: "The brand's home page origin as the search found it: scheme and host only, no path or query (for example https://www.example.com), or null" },
    note: { type: "STRING", description: "One short sentence on how its logo looks and what that means for this brief" },
  },
  required: ["name", "site", "note"],
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

type Reference = { name: string; site: string | null; note: string };
type Direction = { say: string; mood: string; posture: string; energy: string; references: string[] };
type Research = { say: string; competitors: Reference[]; neighbors: Reference[]; direction: Direction };

const directionCard = (value: Direction) => [value.mood, value.posture, value.energy, ...value.references];

export async function research(turn: Turn): Promise<Outcome> {
  const card = turn.current("direction");
  const next = turn.take();

  // First visit, or the brief changed: research, then the direction.
  if (card === null) {
    await turn.status(WORKING.research);
    const foundChecked = await turn.composeCard(
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
    if (foundChecked === null) {
      await turn.decline();
      return "wait";
    }
    const found = foundChecked.lineHeld ? { ...foundChecked.value, say: declineLine(turn.stage), direction: { ...foundChecked.value.direction, say: "" } } : foundChecked.value;
    // Each brand's own site icon, fetched and stored here; the card's default image where a site gives none.
    const cards = (list: Reference[]) =>
      Promise.all(
        list.slice(0, 3).map(async (entry) => {
          const icon = await siteIcon(entry.site, turn.signal);
          const imageFileId = icon === null ? null : await turn.store.saveFile(icon, "image/png");
          return { name: entry.name, note: entry.note, ...(imageFileId !== null ? { imageFileId } : { imageUrl: null }) };
        }),
      );
    const [competitors, neighbors] = await Promise.all([cards(found.competitors), cards(found.neighbors)]);
    console.log(`Research: ${[...competitors, ...neighbors].filter((entry) => "imageFileId" in entry).length} of ${competitors.length + neighbors.length} site icons found`);
    await turn.write([
      { op: "artifact", kind: "research", artifact: { say: found.say, competitors, neighbors } },
      { op: "artifact", kind: "direction", artifact: { ...found.direction, approved: false } },
    ]);
    return "wait";
  }

  // The person asked for a change to the direction.
  if (next?.act === "redo") {
    await turn.status(WORKING.research);
    const revisedChecked = await turn.composeCard(
      () =>
        turn.think<Direction>({
          section: "research",
          task: "Revise the direction as the person asked.",
          facts: { brief: briefOf(turn), research: turn.latest("research")?.artifact ?? null, directionSoFar: card.artifact, whatThePersonAskedFor: asked(next.request) },
          shape: direction,
        }),
      (value) => ({ line: value.say, card: directionCard(value) }),
    );
    const revised = revisedChecked === null ? null : revisedChecked.lineHeld ? { ...revisedChecked.value, say: declineLine(turn.stage) } : revisedChecked.value;
    if (revised === null) await turn.decline();
    else await turn.write([{ op: "artifact", kind: "direction", artifact: { ...revised, approved: false, ...requestsOf(next.request) } }]);
    return "wait";
  }

  if (card.artifact!.approved === true) {
    await turn.write([{ op: "project", stage: "type" }]);
    return "continue";
  }

  if (next !== null) await turn.answer(next, "the person to approve the direction or ask for a change");
  return "wait";
}

/** The approved direction, as later steps read it. */
export function directionOf(turn: Turn): Record<string, unknown> {
  const { say: _say, approved: _approved, requests: _requests, ...fields } = turn.latest("direction")?.artifact ?? {};
  return fields;
}

/** The competitors found, for the "distinct from competitors" check. */
export function competitorsOf(turn: Turn): unknown {
  return (turn.latest("research")?.artifact?.competitors ?? []).map((entry: Reference) => ({ name: entry.name, logo: entry.note }));
}

/** The competitors' own site icons, on white at the size Jev reads, for the same check. Empty when none were found. */
export async function competitorImages(turn: Turn): Promise<Image[]> {
  const ids = (turn.latest("research")?.artifact?.competitors ?? []).map((entry: { imageFileId?: string }) => entry.imageFileId).filter((id: unknown): id is string => typeof id === "string");
  const files = await Promise.all(ids.map((id: string) => turn.store.readFile(id).catch(() => null)));
  return files.filter((file): file is { bytes: Uint8Array; contentType: string } => file !== null).map((file) => ({ bytes: forJudging(file.bytes), mime: "image/png" }));
}
