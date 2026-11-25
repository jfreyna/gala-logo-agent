/**
 * Phase 5, the kit, and the picks that follow it.
 *
 * The kit pipeline (kit/) does the work: the chosen mark, the typeface and
 * the colors go in, and the lock-ups, the square, the social image and the
 * spec sheet come out. This step stores them, zips each format for
 * download, and shows the kit card and the picks card.
 */
import { buildKit, slugify, type KitFile } from "../../kit/src/index.ts";
import type { BrandColors } from "../colorways.ts";
import type { Shape } from "../gemini.ts";
import { ask, YES } from "../jev.ts";
import { mentionsHex } from "../guard.ts";
import { KIT_LINE, PICKS_LINE, WORKING } from "../lines.ts";
import { headingFor } from "../memory.ts";
import type { Operation, StoredFile } from "../store.ts";
import type { Outcome, Turn } from "../turn.ts";
import { zip } from "../zip.ts";
import { briefOf } from "./brief.ts";
import { chosenConcept } from "./directions.ts";
import { familyOf } from "./type.ts";

const SAY: Shape = { type: "OBJECT", properties: { say: { type: "STRING" } }, required: ["say"] };
const LINES: Shape = { type: "OBJECT", properties: { lines: { type: "ARRAY", items: { type: "STRING" } } }, required: ["lines"] };

/** The kit card's format chips. */
const FORMATS = ["SVG", "EPS", "PNG", "Square", "Social"];

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
async function memoryOperations(turn: Turn, outcome: { mark: string; family: string }, facts: Record<string, unknown>): Promise<Operation[]> {
  const operations: Operation[] = [{ op: "remember", group: "From past projects", text: `${turn.brand}: picked the ${outcome.mark} mark, set in ${outcome.family}.` }];
  const { lines } = await turn.think<{ lines: string[] }>({ section: "memory", task: "List what is worth remembering about this person, apart from the project's outcome, which is already recorded.", facts, shape: LINES });
  const kept = lines.filter((line) => line.trim() !== "").slice(0, 4);
  if (kept.length > 0 && (await turn.mayShow({ line: "", card: kept }))) {
    operations.push(...(await Promise.all(kept.map(async (line): Promise<Operation> => ({ op: "remember", group: await headingFor(line, turn.signal), text: line })))));
  }
  return operations;
}

export async function kit(turn: Turn): Promise<Outcome> {
  await turn.status(WORKING.kit);
  const mark = chosenConcept(turn, "variationSet");
  const source = await turn.store.readFile(mark.sourceFileId);
  const set = turn.latest("colorwaySet")!.artifact!;
  const colorway = set.colorways.find((entry: { id: string }) => entry.id === set.chosenId);
  const colors = set.colors as BrandColors;
  const family = familyOf(turn);

  const built = await buildKit({
    mark: { bytes: source.bytes, mime: source.contentType as "image/png" | "image/jpeg" },
    name: turn.brand,
    fontFamily: family,
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
            lockups: PREVIEWS.map((preview) => preview.label),
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
  // Every draft Gala showed, for the "hated" row of the picks card.
  const drafts = turn.state.messages
    .filter((message) => message.kind === "conceptSet" || message.kind === "variationSet")
    .flatMap((message) => [...message.artifact!.concepts, ...(message.artifact!.discarded ?? message.artifact!.setAside ?? [])])
    .map((draft: { id: string; markFileId: string }) => ({ id: draft.id, markFileId: draft.markFileId }));
  const remembered = await memoryOperations(turn, { mark: mark.name, family }, { brief: briefOf(turn), chosenMark: mark.name, typeface: family, colorway: colorway.name });

  await turn.write([
    { op: "kit", files, downloads, spec: built.spec },
    {
      op: "artifact",
      kind: "kit",
      artifact: { say: words?.say ?? KIT_LINE, lockups: PREVIEWS.map((preview) => ({ label: preview.label, previewFileId: fileFor(preview.lockup, preview.variant), ground: preview.ground })), formats: FORMATS },
    },
    { op: "artifact", kind: "picks", artifact: { say: PICKS_LINE, drafts, finalMarkFileId: fileFor("icon", "color"), answered: null } },
    { op: "project", stage: "picks", latestMarkFileId: fileFor("icon", "color") },
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

export async function picks(turn: Turn): Promise<Outcome> {
  const card = turn.latest("picks");
  if (card === null || card.artifact!.answered === null) {
    if (turn.unansweredText() !== "") await turn.converse("the person to submit their picks or choose not to");
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
  if (turn.unansweredText() !== "") await turn.converse("nothing; the kit is finished. The person can ask for a change or start a new project");
  return "wait";
}
