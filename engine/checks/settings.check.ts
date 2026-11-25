/**
 * Case, Spacing, Layout and Space between land on the right values from
 * varied wording.
 *
 *   node --env-file-if-exists=/home/sprite/gala.env engine/checks/settings.check.ts
 *
 * It calls Jev, so it runs only on the Sprite. Each line prints how sure
 * Jev was of each answer, never the message.
 *
 * What this proves: on these wordings, Jev reads the value the person
 * meant, and a message about something else changes nothing. What it does
 * not: other wordings. The wordings below are test cases only; nothing in
 * the engine matches against them. Each answer is one model's reading.
 */
import { assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { CASE, describeSettings, LAYOUT, readSettings, SPACE_BETWEEN, SPACING, type Setting } from "../settings.ts";

/** What the card shows before the person speaks, chosen so that every expected value is a change. */
const START = { case: "asTyped", spacing: "asDrawn", layout: "sideBySide", spaceBetween: "asSet" } as const;
const SETTINGS: Record<keyof typeof START, Setting<string>> = { case: CASE, spacing: SPACING, layout: LAYOUT, spaceBetween: SPACE_BETWEEN };
const GROUPS = { wordmark: ["case", "spacing"], lockup: ["layout", "spaceBetween"] } as const;

type Field = keyof typeof START;
type Case = { card: keyof typeof GROUPS; said: string; start?: Partial<Record<Field, string>>; expect: Partial<Record<Field, string>> };

const CASES: Case[] = [
  // Case
  { card: "wordmark", said: "Can I see it in all capitals?", expect: { case: "allCaps" } },
  { card: "wordmark", said: "MAKE IT SHOUT. Uppercase every letter.", expect: { case: "allCaps" } },
  { card: "wordmark", said: "I think small letters only would feel friendlier, no capitals at all.", expect: { case: "lowercase" } },
  { card: "wordmark", said: "try it all in lower case", expect: { case: "lowercase" } },
  { card: "wordmark", said: "Put the capitals back the way I wrote the name.", start: { case: "allCaps" }, expect: { case: "asTyped" } },
  { card: "wordmark", said: "Actually go back to how I typed it originally.", start: { case: "lowercase" }, expect: { case: "asTyped" } },
  // Spacing
  { card: "wordmark", said: "The letters feel too far apart, bring them closer.", expect: { spacing: "tight" } },
  { card: "wordmark", said: "Tighten up the tracking a bit.", expect: { spacing: "tight" } },
  { card: "wordmark", said: "Give the letters more room to breathe.", expect: { spacing: "wide" } },
  { card: "wordmark", said: "Could you space the letters out more? Airy, like a fashion label.", expect: { spacing: "wide" } },
  { card: "wordmark", said: "Undo the spacing change, leave it how the font comes.", start: { spacing: "wide" }, expect: { spacing: "asDrawn" } },
  // Both at once
  { card: "wordmark", said: "All caps, and spread the letters out.", expect: { case: "allCaps", spacing: "wide" } },
  // Layout
  { card: "lockup", said: "Put the symbol on top of the name.", expect: { layout: "stacked" } },
  { card: "lockup", said: "I want the name underneath the icon, centered.", expect: { layout: "stacked" } },
  { card: "lockup", said: "Line them up in a row, symbol first and then the name.", start: { layout: "stacked" }, expect: { layout: "sideBySide" } },
  { card: "lockup", said: "Horizontal please, the mark to the left of the words.", start: { layout: "stacked" }, expect: { layout: "sideBySide" } },
  // Space between
  { card: "lockup", said: "The symbol is drifting away from the name, pull them together.", expect: { spaceBetween: "tight" } },
  { card: "lockup", said: "Less gap between the icon and the text.", expect: { spaceBetween: "tight" } },
  { card: "lockup", said: "Add more air between the symbol and the name.", expect: { spaceBetween: "wide" } },
  { card: "lockup", said: "They are crowding each other, move them apart.", expect: { spaceBetween: "wide" } },
  { card: "lockup", said: "Put the gap back to the standard one.", start: { spaceBetween: "wide" }, expect: { spaceBetween: "asSet" } },
  // Nothing asked: every value stays
  { card: "wordmark", said: "I like how sturdy that looks.", expect: {} },
  { card: "wordmark", said: "Can the symbol be a paintbrush?", expect: {} },
  { card: "lockup", said: "They sit well together.", expect: {} },
  { card: "lockup", said: "What colors do you think would suit this?", expect: {} },
];

const h = createHarness("Wordmark and lockup settings, read by Jev");

for (const entry of CASES) {
  const fields = GROUPS[entry.card];
  const expected = Object.entries(entry.expect).map(([field, value]) => `${field} ${value}`).join(", ") || "nothing changes";
  h.check(`${entry.card}: "${entry.said}" → ${expected}`, async () => {
    const start = { ...START, ...entry.start };
    const read = await readSettings(entry.said, Object.fromEntries(fields.map((field) => [field, { setting: SETTINGS[field], current: start[field] }])));
    console.log(`  ${describeSettings(entry.card, read)}`);
    for (const field of fields) assertEqual(read[field]!.value, entry.expect[field] ?? start[field], field);
  });
}

await h.run();
