/**
 * The settings of the wordmark and the lockup: each is one value from a
 * fixed set, shown as chips on the card.
 *
 * A person changes one by pressing its chip, or by saying so. What they
 * say is read by Jev as one pick from a fixed set: one of the setting's
 * values, or that the message asks for no change to it. A generative model never
 * fills one in, and there are no word lists: the sets below hold the values
 * and what each one is, nothing about how a person might ask.
 *
 * What this does not prove: each answer is one model's reading. A value
 * read wrongly shows on the card before the person signs off, and a chip
 * puts it right.
 */
import { nameLines, wordsOf } from "../kit/src/index.ts";
import { ask, SURE, type Choice } from "./jev.ts";

export type Setting<K extends string> = {
  /** What the setting is, as Jev is told it. */
  about: string;
  /** Each value's key, its label on the chip, and what it means. */
  values: Record<K, { label: string; means: string }>;
};

export type Case = "asTyped" | "allCaps" | "lowercase";
export type Spacing = "tight" | "asDrawn" | "wide";
export type Layout = "sideBySide" | "stacked";
export type SpaceBetween = "tight" | "asSet" | "wide";
export type Lines = "oneLine" | "twoLines";

export const CASE: Setting<Case> = {
  about: "the case of the letters in the name",
  values: {
    asTyped: { label: "As typed", means: "The name exactly as the person wrote it" },
    allCaps: { label: "ALL CAPS", means: "Every letter of the name a capital" },
    lowercase: { label: "lowercase", means: "Every letter of the name in lower case" },
  },
};

export const SPACING: Setting<Spacing> = {
  about: "the spacing between the letters of the name",
  values: {
    tight: { label: "Tight", means: "The letters set closer together than the typeface draws them" },
    asDrawn: { label: "As drawn", means: "The letters spaced as the typeface draws them" },
    wide: { label: "Wide", means: "The letters set further apart than the typeface draws them" },
  },
};

export const LAYOUT: Setting<Layout> = {
  about: "how the symbol and the name are arranged together",
  values: {
    sideBySide: { label: "Side by side", means: "The symbol to the left of the name" },
    stacked: { label: "Stacked", means: "The symbol above the name" },
  },
};

/**
 * The name on one line or two. Read at the wordmark and at the
 * lockup; it has no chip, so the person asks in words and the card shows
 * it. Two lines break between words only: a one-word name stays on one
 * line (`canBreak`), and where a longer name breaks is `readBreak`'s.
 */
export const LINES: Setting<Lines> = {
  about: "how many lines the name is set on",
  values: {
    oneLine: { label: "One line", means: "The whole name on one line" },
    twoLines: { label: "Two lines", means: "The name broken between its words onto two lines, one above the other" },
  },
};

export const SPACE_BETWEEN: Setting<SpaceBetween> = {
  about: "the space between the symbol and the name",
  values: {
    tight: { label: "Tight", means: "The symbol and the name closer together" },
    asSet: { label: "As set", means: "The standard space between the symbol and the name" },
    wide: { label: "Wide", means: "The symbol and the name further apart" },
  },
};

/**
 * Letter spacing for each Spacing value, in ems, and the gap between symbol
 * and name for each Space between value, as a multiple of the standard gap.
 * The cards and the kit both read these, so a value means one thing.
 */
export const LETTER_SPACING_EM: Record<Spacing, number> = { tight: -0.02, asDrawn: 0, wide: 0.08 };
export const GAP_SCALE: Record<SpaceBetween, number> = { tight: 0.6, asSet: 1, wide: 1.5 };

/** The name in a case. "As typed" leaves it alone. */
export function inCase(name: string, value: Case): string {
  return value === "allCaps" ? name.toUpperCase() : value === "lowercase" ? name.toLowerCase() : name;
}

export function isValue<K extends string>(setting: Setting<K>, value: unknown): value is K {
  return typeof value === "string" && Object.hasOwn(setting.values, value);
}

/** The answer that means the message does not speak about a setting. */
const NOT_ASKED = "No change asked";

export type Read<K extends string> = {
  /** The value to use: what the person asked for, or the one already set. */
  value: K;
  /** True when Jev could not tell whether the message asks about this setting, or what for. */
  unsure: boolean;
  /** True when Jev is sure the message asks for one of the setting's values (the one set now included). */
  asked: boolean;
  /** How sure Jev was of its answer, for the log. */
  confidence: number;
};

/**
 * Reads several settings from what the person said, in one call. For each
 * setting Jev picks one answer from a fixed set: one of the setting's
 * values, or that the message asks for no change to it. Jev is told what
 * is set now, so "put it back" has something to stand on. A setting
 * changes only when Jev is sure of a value; otherwise the value already
 * set stays.
 */
export async function readSettings<S extends Record<string, { setting: Setting<string>; current: string }>>(said: string, fields: S, signal?: AbortSignal): Promise<{ [F in keyof S]: Read<S[F]["current"]> }> {
  const questions: Record<string, Choice> = {};
  const setNow: Record<string, string> = {};
  for (const [name, field] of Object.entries(fields)) {
    setNow[field.setting.about] = field.setting.values[field.current]!.label;
    questions[name] = {
      type: "choice",
      instructions: `What does \`message\` ask for, for ${field.setting.about}? \`setNow\` says how it is set now.`,
      criteria: {
        ...Object.fromEntries(Object.values(field.setting.values).map((value) => [value.label, value.means])),
        [NOT_ASKED]: `The message does not ask for any change to ${field.setting.about}`,
      },
    };
  }
  const answers = await ask({ state: { message: said, setNow }, questions, signal });
  const result: Record<string, Read<string>> = {};
  for (const [name, field] of Object.entries(fields)) {
    const picked = answers[name]!;
    const sure = picked.confidence >= SURE;
    const key = Object.entries(field.setting.values).find(([, value]) => value.label === picked.choice)?.[0];
    result[name] = { value: sure && key !== undefined ? key : field.current, unsure: !sure, asked: sure && key !== undefined, confidence: picked.confidence };
  }
  return result as { [F in keyof S]: Read<S[F]["current"]> };
}

/** The log line: how sure each answer was, never the message. */
export function describeSettings(stage: string, read: Record<string, Read<string>>): string {
  return `Settings at ${stage}: ${Object.entries(read).map(([name, entry]) => `${name} sure ${entry.confidence.toFixed(2)}`).join(", ")}`;
}

/** True when the name has a place to break: two words or more. */
export function canBreak(name: string): boolean {
  return wordsOf(name).length >= 2;
}

/** The answer that means the message names no place to break the name. */
const NO_BREAK_NAMED = "No break named";

/**
 * Where a name of two words or more breaks onto two lines, as the number of
 * words on the first line. Two words have one place. With more, Jev picks
 * one of the word boundaries, each shown as the two lines it makes, or
 * that the message names none. When it names none, or Jev is unsure, the
 * break already set stays; with none set, `balanced` picks: the boundary
 * whose two lines are closest in width, measured in the typeface. That is a
 * typesetting rule, not a reading of the person's words.
 */
export async function readBreak(said: string, name: string, current: number | null, balanced: (candidates: number[]) => Promise<number>, signal?: AbortSignal): Promise<{ breakAfter: number; confidence: number | null }> {
  const words = wordsOf(name);
  const candidates = words.slice(1).map((_, index) => index + 1);
  if (candidates.length === 1) return { breakAfter: candidates[0]!, confidence: null };
  const labelOf = (after: number) => nameLines(name, after).map((line) => `"${line}"`).join(" over ");
  const answers = await ask({
    state: { message: said, name },
    questions: {
      breakAt: {
        type: "choice",
        instructions: "`name` will be set on two lines, broken between two of its words. Where does `message` ask for it to break?",
        criteria: {
          ...Object.fromEntries(candidates.map((after) => [labelOf(after), `${nameLines(name, after)[0]} on the first line and ${nameLines(name, after)[1]} on the second`])),
          [NO_BREAK_NAMED]: "The message does not say where the name should break",
        },
      },
    },
    signal,
  });
  const picked = answers.breakAt;
  const after = candidates.find((candidate) => labelOf(candidate) === picked.choice);
  if (picked.confidence >= SURE && after !== undefined) return { breakAfter: after, confidence: picked.confidence };
  return { breakAfter: current !== null && candidates.includes(current) ? current : await balanced(candidates), confidence: picked.confidence };
}
