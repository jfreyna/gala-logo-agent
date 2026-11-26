/**
 * Phase 5, the kit, and the picks that follow it.
 *
 * The kit pipeline (kit/) does the work: the chosen mark, the typeface and
 * the colors go in, and the lock-ups, the square, the social image and the
 * spec sheet come out. This step stores them, zips each format for
 * download, and shows the kit card alone (FRI-1723). The picks card, for
 * the halls, waits for the first finished download, or for the person's
 * next message, so it never pushes the kit off the screen as it arrives.
 */
import { buildKit, slugify, type KitFile } from "../../kit/src/index.ts";
import type { BrandColors } from "../colorways.ts";
import type { Shape } from "../gemini.ts";
import { ask, YES } from "../jev.ts";
import { mentionsHex } from "../guard.ts";
import { FILES_SAVED_LINE, KIT_LINE, NAME_ONLY_KIT_LINE, PICKS_LINE, WORKING } from "../lines.ts";
import { headingFor } from "../memory.ts";
import type { Operation, StoredFile } from "../store.ts";
import type { Outcome, Turn } from "../turn.ts";
import { zip } from "../zip.ts";
import { briefOf } from "./brief.ts";
import { chosenConcept } from "./directions.ts";
import { lockupOf } from "./lockup.ts";
import { familyOf } from "./type.ts";
import { letterSpacingOf } from "./wordmark.ts";

const SAY: Shape = { type: "OBJECT", properties: { say: { type: "STRING" } }, required: ["say"] };
const LINES: Shape = { type: "OBJECT", properties: { lines: { type: "ARRAY", items: { type: "STRING" } } }, required: ["lines"] };

/** The kit card's format chips. */
const FORMATS = ["SVG", "EPS", "PNG", "Square", "Social"];

/** For a logo of the name alone: the wordmark in color, in black and in white. */
const NAME_ONLY_PREVIEWS = [
  { label: "Wordmark", lockup: "wordmark", variant: "color", ground: "white" },
  { label: "All black", lockup: "wordmark", variant: "black", ground: "white" },
  { label: "All white", lockup: "wordmark", variant: "white", ground: "black" },
] as const;

/** The lock-ups the kit card previews, each from one of the kit's SVG files. */
const PREVIEWS = [
  { label: "Primary", lockup: "primary", variant: "color", ground: "white" },
  { label: "Stacked", lockup: "stacked", variant: "color", ground: "white" },
  { label: "Icon", lockup: "icon", variant: "color", ground: "white" },
  { label: "Wordmark", lockup: "wordmark", variant: "color", ground: "white" },
  { label: "All black", lockup: "primary", variant: "black", ground: "white" },
  { label: "All white", lockup: "primary", variant: "white", ground: "black" },
] as const;

/** Stores files a few at a time. */
async function storeAll(turn: Turn, files: KitFile[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (let start = 0; start < files.length; start += 6) {
    await Promise.all(files.slice(start, start + 6).map(async (file) => ids.set(file.path, await turn.store.saveFile(file.bytes, file.mime))));
  }
  return ids;
}

/**
 * What Gala remembers from a finished project. The outcome is a fact, so
 * code records it, worded as the Memory view's design words it. What the
 * project taught about the person's taste is the model's to write, and
 * Jev files each of those lines under its heading.
 */
async function memoryOperations(turn: Turn, outcome: { mark: string | null; family: string }, facts: Record<string, unknown>): Promise<Operation[]> {
  const operations: Operation[] = [{ op: "remember", group: "From past projects", text: outcome.mark === null ? `${turn.brand}: chose a wordmark with no symbol, set in ${outcome.family}.` : `${turn.brand}: picked the ${outcome.mark} mark, set in ${outcome.family}.` }];
  const { lines } = await turn.think<{ lines: string[] }>({ section: "memory", task: "List what is worth remembering about this person, apart from the project's outcome, which is already recorded.", facts, shape: LINES });
  const kept = lines.filter((line) => line.trim() !== "").slice(0, 4);
  if (kept.length > 0 && (await turn.mayShow({ line: "", card: kept }))) {
    operations.push(...(await Promise.all(kept.map(async (line): Promise<Operation> => ({ op: "remember", group: await headingFor(line, turn.signal), text: line })))));
  }
  return operations;
}

export async function kit(turn: Turn): Promise<Outcome> {
  await turn.status(WORKING.kit);
  // A logo with no symbol has no mark: the kit is then the wordmark alone.
  const nameOnly = turn.nameOnly;
  const mark = nameOnly ? null : chosenConcept(turn, "variationSet");
  const source = mark === null ? null : await turn.store.readFile(mark.sourceFileId);
  const set = turn.latest("colorwaySet")!.artifact!;
  const colorway = set.colorways.find((entry: { id: string }) => entry.id === set.chosenId);
  const colors = set.colors as BrandColors;
  const family = familyOf(turn);
  const previews = nameOnly ? NAME_ONLY_PREVIEWS : PREVIEWS;

  const built = await buildKit({
    ...(source !== null ? { mark: { bytes: source.bytes, mime: source.contentType as "image/png" | "image/jpeg" } } : {}),
    name: turn.nameAsSet,
    fontFamily: family,
    // What the person signed off: the wordmark's letter spacing, and the lockup's gap and layout.
    letterSpacing: letterSpacingOf(turn),
    ...lockupOf(turn),
    colors: { primary: colors.primary, secondary: colors.secondary, ...(colors.tertiary !== null ? { tertiary: colors.tertiary } : {}) },
    // A white ground on screen becomes the kit's neutral gray for the square and the social image.
    colorway: { mark: colorway.assignment.mark, wordmark: colorway.assignment.wordmark, ...(colorway.assignment.ground !== "white" ? { ground: colorway.assignment.ground } : {}) },
  });

  const ids = await storeAll(turn, built.files);
  const files: StoredFile[] = built.files.map((file) => ({
    label: `${file.lockup}, ${file.variant}, ${file.format.toUpperCase()}`,
    fileName: file.path.split("/").pop()!,
    contentType: file.mime,
    fileId: ids.get(file.path)!,
  }));

  // What each format chip hands over, and the whole kit in one zip.
  const slug = slugify(turn.brand);
  const folder = (name: string) => built.files.filter((file) => file.path.startsWith(`${name}/`));
  const download = async (label: string, fileName: string, contentType: string, bytes: Uint8Array): Promise<StoredFile> => ({ label, fileName, contentType, fileId: await turn.store.saveFile(bytes, contentType) });
  const downloads = await Promise.all([
    download("SVG", `${slug}-svg.zip`, "application/zip", zip(folder("svg"))),
    download("EPS", `${slug}-eps.zip`, "application/zip", zip(folder("eps"))),
    download("PNG", `${slug}-png.zip`, "application/zip", zip(folder("png"))),
    download("Square", folder("square")[0]!.path.split("/").pop()!, "image/png", folder("square")[0]!.bytes),
    download("Social", folder("social")[0]!.path.split("/").pop()!, "image/png", folder("social")[0]!.bytes),
    download("Kit", `${slug}-logo-kit.zip`, "application/zip", zip(built.files)),
  ]);

  // The kit is built whatever happens to the words: a line that fails its checks gives way to the fixed one.
  const words = await turn.compose(
    () =>
      turn.think<{ say: string }>({
        section: "kit",
        task: "Tell the person the kit is ready.",
        facts: {
          brand: turn.brand,
          typeface: family,
          kitHolds: {
            lockups: previews.map((preview) => preview.label),
            ...(nameOnly ? { logo: "the name alone, with no symbol; never mention a mark or a symbol" } : {}),
            fileFormats: ["SVG", "EPS", "PNG"],
            images: ["a square image", "a social image"],
            specSheet: ["clear space", "minimum sizes", "the typeface and its license", "each color's hex, RGB and CMYK values and its 50 to 900 ladder"],
          },
        },
        shape: SAY,
      }),
    (value) => ({ line: value.say }),
    (value) => !mentionsHex(value.say),
  );

  const fileFor = (lockup: string, variant: string) => ids.get(`svg/${slug}-${lockup}-${variant}.svg`)!;
  const remembered = await memoryOperations(turn, { mark: mark?.name ?? null, family }, { brief: briefOf(turn), chosenMark: mark?.name ?? "none: the logo is the name alone", typeface: family, colorway: colorway.name });
  // The logo as one file: the icon, or the wordmark when there is no symbol.
  const logo = nameOnly ? fileFor("wordmark", "color") : fileFor("icon", "color");

  await turn.write([
    { op: "kit", files, downloads, spec: built.spec },
    {
      op: "artifact",
      kind: "kit",
      // `hallsMarkFileId` is the logo the picks card will offer for the Hall of fame; `downloaded` is set by the page's first finished download.
      artifact: {
        say: words?.say ?? (nameOnly ? NAME_ONLY_KIT_LINE : KIT_LINE),
        lockups: previews.map((preview) => ({ label: preview.label, previewFileId: fileFor(preview.lockup, preview.variant), ground: preview.ground })),
        formats: FORMATS,
        hallsMarkFileId: logo,
        downloaded: false,
      },
    },
    // The project waits at the picks step with no picks card yet: `picks` below writes it.
    { op: "project", stage: "picks", latestMarkFileId: logo },
    ...remembered,
  ]);
  return "wait";
}

/**
 * The quote check: before any reason a person wrote shows in the halls,
 * Jev is asked whether it is offensive or carries personal information. A
 * failed check keeps the logo and drops the quote.
 *
 * What this does not prove: it is one model's reading. It will miss coded
 * insults and personal details it does not recognise as such.
 */
export async function quotePasses(quote: string, signal?: AbortSignal): Promise<boolean> {
  const answers = await ask({
    state: { quote },
    questions: {
      offensive: { type: "noul", instructions: "Does `quote` contain offensive content?" },
      personal: { type: "noul", instructions: "Does `quote` contain personal information?" },
    },
    signal,
  });
  return answers.offensive.noul < YES && answers.personal.noul < YES;
}

/** Every draft Gala showed, for the "hated" row of the picks card. */
function draftsShown(turn: Turn): { id: string; markFileId: string }[] {
  return (
    turn.state.messages
      .filter((message) => message.kind === "conceptSet" || message.kind === "variationSet")
      .flatMap((message) => [...message.artifact!.concepts, ...(message.artifact!.discarded ?? message.artifact!.setAside ?? [])])
      .map((draft: { id: string; markFileId: string }) => ({ id: draft.id, markFileId: draft.markFileId }))
      // Going back puts a copy of a card in the conversation, so a draft can appear twice.
      .filter((draft: { id: string }, index: number, all: { id: string }[]) => all.findIndex((other) => other.id === draft.id) === index)
  );
}

/**
 * The picks step. Its card, for the halls, is written here, once, after
 * the kit card has had the screen to itself: when the page reports the
 * first finished download (the kit card's `downloaded`, set by `act`), or
 * after Gala answers the person's next message if they never download.
 * Once the card exists it is a stored message, so a reload or a second
 * download finds it and adds nothing.
 */
export async function picks(turn: Turn): Promise<Outcome> {
  const next = turn.take();
  const card = turn.current("picks");
  if (card === null) {
    const kitCard = turn.current("kit");
    // No kit card means the step was reached some other way; there is nothing to offer for the halls.
    if (kitCard === null) {
      if (next !== null) await turn.answer(next, "the person to download their kit from its card");
      return "wait";
    }
    const downloaded = kitCard.artifact!.downloaded === true;
    if (next !== null) await turn.answer(next, "the person to download their kit from its card");
    else if (!downloaded) return "wait";
    await turn.write([
      {
        op: "artifact",
        kind: "picks",
        artifact: { say: downloaded ? FILES_SAVED_LINE : PICKS_LINE, drafts: draftsShown(turn), finalMarkFileId: kitCard.artifact!.hallsMarkFileId, answered: null },
      },
    ]);
    return "wait";
  }
  if (card.artifact!.answered === null) {
    if (next !== null) await turn.answer(next, "the person to submit their picks or choose not to");
    return "wait";
  }
  await turn.status(WORKING.picks);
  const checked = await Promise.all(
    turn.state.quotesToCheck.map(async (entry): Promise<Operation> => ({ op: "quoteChecked", submissionId: entry.id, passed: await quotePasses(entry.quote, turn.signal) })),
  );
  const words = await turn.compose(
    () => turn.think<{ say: string }>({ section: "picks", task: "Close the project.", facts: { brand: turn.brand, picks: card.artifact!.answered }, shape: SAY }),
    (value) => ({ line: value.say }),
  );
  await turn.write([...checked, { op: "project", stage: "done" }, ...(words !== null ? [{ op: "say" as const, text: words.say }] : [])]);
  return "wait";
}

/** After the project is finished, Gala still answers. */
export async function done(turn: Turn): Promise<Outcome> {
  const next = turn.take();
  if (next !== null) await turn.answer(next, "nothing; the kit is finished. The person can go back to any step to change it, or start a new project");
  return "wait";
}
