/**
 * Drawing three marks, for the directions and for the variations.
 *
 * Each of the three slots is drawn, traced and judged on its own. A draft
 * that fails a check is set aside with the reason and the slot is drawn
 * again, up to three times. The first two tries use the cheapest image
 * model; the third steps up one model. Whatever happens, the person gets
 * three options: if a slot never passes, its last draft is kept and its
 * problems are passed on so Gala can say so.
 */
import { ModelError, type Image } from "./gemini.ts";
import { drawMark, judgeDraft, markSvg, type DraftContext, type Judgement, type Mark } from "./marks.ts";
import { optionId, type Turn } from "./turn.ts";

export type Idea = { name: string; idea: string; prompt: string };

export type Draft = {
  id: string;
  name: string;
  idea: string;
  markFileId: string;
  sourceFileId: string;
  judgement: Judgement;
};

export type SetAside = { id: string; markFileId: string; sourceFileId: string; reason: string };

const TRIES = 3;

async function saveMark(turn: Turn, mark: Mark): Promise<{ markFileId: string; sourceFileId: string }> {
  const [markFileId, sourceFileId] = await Promise.all([
    turn.store.saveFile(new TextEncoder().encode(markSvg(mark)), "image/svg+xml"),
    turn.store.saveFile(mark.source.bytes, mark.source.mime),
  ]);
  return { markFileId, sourceFileId };
}

async function draftOne(turn: Turn, idea: Idea, context: DraftContext, from: Image | undefined, setAside: SetAside[]): Promise<Draft> {
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    let mark: Mark;
    try {
      mark = await drawMark({ prompt: idea.prompt, from, step: attempt < TRIES ? 0 : 1, signal: turn.signal });
    } catch (error) {
      // A blank or untraceable image is a failed try, not a failed turn.
      if (turn.signal.aborted || attempt === TRIES) throw error;
      continue;
    }
    const judgement = await judgeDraft(mark, context, turn.signal);
    const files = await saveMark(turn, mark);
    if (judgement.rejected.length === 0 || attempt === TRIES) return { id: optionId(), name: idea.name, idea: idea.idea, ...files, judgement };
    setAside.push({ id: optionId(), ...files, reason: judgement.rejected[0]! });
  }
  throw new ModelError("No draft could be drawn.");
}

export async function draftThree(turn: Turn, ideas: Idea[], context: DraftContext, from?: Image): Promise<{ drafts: Draft[]; setAside: SetAside[] }> {
  const setAside: SetAside[] = [];
  const drafts = await Promise.all(ideas.slice(0, 3).map((idea) => draftOne(turn, idea, context, from, setAside)));
  return { drafts, setAside };
}

/** The badges on a concept card. */
export function badges(judgement: Judgement): { label: string; pass: boolean }[] {
  return [
    { label: "16px", pass: judgement.sixteen },
    { label: "Circle", pass: judgement.circle },
    { label: "Inverted", pass: judgement.inverted },
  ];
}

/** What Gala is told about each draft before writing about it. */
export function findings(drafts: Draft[], letters: string[]): unknown[] {
  return drafts.map((draft, index) => ({
    letter: letters[index],
    name: draft.name,
    idea: draft.idea,
    holdsAt16px: draft.judgement.sixteen,
    worksInACircle: draft.judgement.circle,
    worksInverted: draft.judgement.inverted,
    problems: draft.judgement.rejected,
  }));
}
