import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { StudioView } from "../studio/StudioView";
import { WorkPanel } from "../studio/panel/WorkPanel";
import type { PanelView, Phase } from "../studio/panel/types";
import { ARTIFACT_KINDS, type ArtifactAction, type ArtifactKind, type StreamItem } from "../studio/streamTypes";
import { sizeLabel } from "../studio/artifacts/Upload";
import { projectName, type Stage } from "../lib/stages";
import { useRouter } from "../lib/router";
import { download, fileMemoryLine, requestTurn, stopTurn } from "../lib/turn";
import { groupsOf, mainClass, rankFamilies, topMoods, useTrayData } from "../lib/typeTray";

/** The steps the History view lists, in order, with the stages each covers. */
const PHASES: { key: string; name: string; stages: Stage[] }[] = [
  { key: "brief", name: "Brief", stages: ["brief"] },
  { key: "research", name: "Research", stages: ["research"] },
  { key: "type", name: "Type", stages: ["type"] },
  { key: "directions", name: "Directions", stages: ["directions"] },
  { key: "variations", name: "Variations", stages: ["variations"] },
  { key: "stressTest", name: "Stress test", stages: ["stressTest"] },
  { key: "color", name: "Color", stages: ["pickColors", "colorways"] },
  { key: "kit", name: "Kit", stages: ["kit", "picks", "done"] },
];

const KIT_FORMATS = ["SVG", "EPS", "PNG", "Square", "Social"];

/** The prompt bar's examples (from the studio's design). */
const HINTS = ["Here’s what my business does and who it’s for", "Show me the logos my competitors use", "Keep it simple enough to work at 16px"];

/** How many more times a turn that did not run is asked for. */
const TURN_RETRIES = 3;

/** How many families the type tray lists. All are ranked first; this is how much of the ranking shows. */
const TRAY_LENGTH = 40;

type Card = { id: string; kind: ArtifactKind; data: Record<string, any> };

/** Which panel is open, and for the type tray, which card it is changing. */
type Open =
  | { view: "history" }
  | { view: "memory" }
  | { view: "color" }
  | { view: "kit" }
  | { view: "type"; messageId: string; cardId: string; group: string; moods: string[] | null }
  | null;

function isArtifactKind(kind: string): kind is ArtifactKind {
  return (ARTIFACT_KINDS as readonly string[]).includes(kind);
}

/** The prompt bar's placeholder at each step, for desktop and for a phone (from the studio's design). */
function placeholders(stage: Stage, hasBrief: boolean, chosenMark: string | null): [string, string] {
  switch (stage) {
    case "brief":
      return hasBrief ? ["Tell me who it’s for, mostly.", "Tell me who it’s for."] : ["Tell me about the brand you're building.", "Tell me about your brand."];
    case "research":
      return ["Or tell me what to change in the direction.", "Or tell me what to change in the direction."];
    case "type":
      return ["Pick A, B or C, or name a font you like.", "Pick A, B or C."];
    case "directions":
      return ["Pick A, B or C, or tell me what to change.", "Pick A, B or C."];
    case "variations":
      return ["Pick 1, 2 or 3, or ask for a change.", "Pick 1, 2 or 3."];
    case "stressTest":
      return [chosenMark !== null ? `Approve ${chosenMark}, or ask for a change.` : "Approve, or change it.", "Approve, or change it."];
    case "pickColors":
      return ["Or describe your colors in words.", "Or describe your colors in words."];
    case "colorways":
      return ["Pick A, B or C, or ask for other colors.", "Pick A, B or C."];
    default:
      return ["Ask for a change, or start a new project.", "Ask for a change."];
  }
}

/** The line under each step in the History view. */
function summaries(cards: Card[], stage: Stage): Record<string, { summary: string; thumbs?: string[] }> {
  const latest = (kind: ArtifactKind) => cards.findLast((card) => card.kind === kind)?.data;
  const chosen = (set: Record<string, any> | undefined, list: string) => set?.[list]?.find((entry: { id: string }) => entry.id === set.chosenId);
  const result: Record<string, { summary: string; thumbs?: string[] }> = {
    variations: { summary: "Three refinements of your pick" },
    stressTest: { summary: "16px, circle, inverted, poster" },
    color: { summary: "Palette and three colorways" },
    kit: { summary: "SVG, EPS, PNG, square and social images" },
  };
  const brief = latest("brief");
  if (brief?.brand) {
    const what = typeof brief.whatYouDo === "string" && brief.whatYouDo.length > 0 ? `, ${brief.whatYouDo.charAt(0).toLowerCase()}${brief.whatYouDo.slice(1)}` : "";
    result.brief = { summary: `${brief.brand}${what}` };
  }
  const research = latest("research");
  if (research) result.research = { summary: `${research.competitors.length} competitors and ${research.neighbors.length} neighbors reviewed` };
  const type = latest("typeSet");
  const typeface = chosen(type, "directions");
  if (typeface && type?.saved) result.type = { summary: `${typeface.family} · ${String(typeface.category).replace(" · ", ", ")}` };
  else if (type) result.type = { summary: "3 typefaces, waiting on your pick" };
  const concepts = latest("conceptSet");
  if (concepts) {
    const pick = chosen(concepts, "concepts");
    result.directions = pick ? { summary: pick.name } : { summary: "3 directions, waiting on your pick", thumbs: concepts.concepts.map((concept: { markUrl: string }) => concept.markUrl) };
  }
  const variations = latest("variationSet");
  if (variations && stage !== "directions") {
    const pick = chosen(variations, "concepts");
    result.variations = pick ? { summary: pick.name } : { summary: "3 variations, waiting on your pick", thumbs: variations.concepts.map((concept: { markUrl: string }) => concept.markUrl) };
  }
  return result;
}

function phasesFor(stage: Stage, lines: Record<string, { summary: string; thumbs?: string[] }>): Phase[] {
  const current = PHASES.findIndex((phase) => phase.stages.includes(stage));
  return PHASES.map((phase, index) => ({
    key: phase.key,
    name: phase.name,
    summary: lines[phase.key]?.summary ?? "",
    status: stage === "done" || index < current ? "done" : index === current ? "current" : "upcoming",
    thumbs: index === current ? lines[phase.key]?.thumbs : undefined,
  }));
}

/**
 * One logo's studio. The person's side (messages, uploads, memory, the
 * buttons on cards) writes straight to storage. Whenever that leaves Gala
 * something to answer, this page asks Gala's server for a turn, and what
 * Gala makes arrives through the live queries.
 */
export function Studio({ projectId }: { projectId: Id<"projects"> }) {
  const project = useQuery(api.projects.get, { projectId });
  const messages = useQuery(api.messages.list, { projectId });
  const memories = useQuery(api.memories.list);
  const hasKit = project !== undefined && ["picks", "done"].includes(project.stage);
  const kit = useQuery(api.kits.forProject, hasKit ? { projectId } : "skip");
  const send = useMutation(api.messages.send);
  const act = useMutation(api.studio.act);
  const startUpload = useMutation(api.uploads.startUpload);
  const finishUpload = useMutation(api.uploads.finishUpload);
  const addMemory = useMutation(api.memories.add);
  const editMemory = useMutation(api.memories.edit);
  const removeMemory = useMutation(api.memories.remove);
  const clearMemory = useMutation(api.memories.clearAll);

  const [text, setText] = useState("");
  const [file, setFile] = useState<{ file: File; previewUrl: string | null } | null>(null);
  const [panel, setPanel] = useState<Open>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const tray = useTrayData(panel?.view === "type");

  // A turn's lock runs out after a while. The query's answer is not
  // recomputed as time passes, so the page watches the clock itself: once
  // the lock is older than its lifetime, Gala is no longer "working".
  const [, setLockChecked] = useState(0);
  const lockEndsAt = project?.turnStartedAt != null ? project.turnStartedAt + project.turnLifetimeMs : null;
  useEffect(() => {
    if (lockEndsAt === null) return;
    const timer = window.setTimeout(() => setLockChecked((count) => count + 1), Math.max(0, lockEndsAt - Date.now()) + 500);
    return () => window.clearTimeout(timer);
  }, [lockEndsAt]);
  const working = project !== undefined && lockEndsAt !== null && Date.now() < lockEndsAt ? (project.working ?? "") : null;

  // Gala is owed a turn whenever the person has done something unanswered
  // and no turn is running. One request at a time. A turn that did not run
  // (the sign-in had lapsed, the server was busy or out of reach) is asked
  // for again, a few times, each with a new token.
  const asking = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const owed = project?.waitingOnGala === true && working === null;
  useEffect(() => {
    if (!owed) {
      setAttempt(0);
      return;
    }
    if (asking.current) return;
    asking.current = true;
    let retry: number | undefined;
    void requestTurn(projectId).then((state) => {
      asking.current = false;
      if (state !== "done" && state !== "stopped" && attempt < TURN_RETRIES) retry = window.setTimeout(() => setAttempt(attempt + 1), 2000 * (attempt + 1));
    });
    return () => window.clearTimeout(retry);
  }, [owed, projectId, attempt]);

  const cards = useMemo<Card[]>(
    () => (messages ?? []).flatMap((message) => (isArtifactKind(message.kind) && message.artifact !== null ? [{ id: message._id, kind: message.kind, data: message.artifact as Record<string, any> }] : [])),
    [messages],
  );

  const items = useMemo<StreamItem[]>(() => {
    const stream = (messages ?? []).flatMap((message): StreamItem[] => {
      const id = message._id;
      if (message.kind === "upload" && message.upload) {
        return [{ id, kind: "upload", text: message.text ?? "", fileName: message.upload.fileName, sizeLabel: sizeLabel(message.upload.sizeBytes), imageUrl: message.upload.url }];
      }
      if (isArtifactKind(message.kind) && message.artifact !== null) {
        // The engine writes each artifact in the shape its kind names.
        return [{ id, kind: message.kind, data: message.artifact } as unknown as StreamItem];
      }
      return [{ id, kind: message.author === "gala" ? "gala" : "visitor", text: message.text ?? "" }];
    });
    // Gala's "working" line, while a turn runs.
    if (working !== null) stream.push({ id: "working", kind: "working", text: working });
    return stream;
  }, [messages, working]);

  async function sendMessage() {
    const words = text.trim();
    const attached = file;
    if (words.length === 0 && attached === null) return;
    setText("");
    setFile(null);
    let uploadId: Id<"uploads"> | undefined;
    if (attached !== null) {
      const address = await startUpload({ projectId });
      const response = await fetch(address, { method: "POST", headers: { "Content-Type": attached.file.type }, body: attached.file });
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      uploadId = await finishUpload({ projectId, fileId: storageId, fileName: attached.file.name });
      if (attached.previewUrl !== null) URL.revokeObjectURL(attached.previewUrl);
    }
    await send({ projectId, text: words, uploadId });
  }

  function saveFile(label: string) {
    const entry = kit?.downloads.find((candidate) => candidate.label === label);
    if (entry?.url) void download(entry.url, entry.fileName);
  }

  function onAction(action: ArtifactAction, itemId: string) {
    const messageId = itemId as Id<"messages">;
    const record = (recorded: Parameters<typeof act>[0]["action"]) => void act({ projectId, messageId, action: recorded });
    switch (action.type) {
      // Editing the brief, or the direction, happens in the chat: the prompt is readied for the person.
      case "editBrief":
        setText("Change the brief: ");
        setFocusRequest((value) => value + 1);
        return;
      case "changeDirection":
        setFocusRequest((value) => value + 1);
        return;
      case "changeType":
        return setPanel({ view: "type", messageId, cardId: action.id, group: "All", moods: null });
      case "saveColors":
        return record({ type: "saveColors", primary: action.colors.primary, secondary: action.colors.secondary, tertiary: action.colors.tertiary });
      case "downloadFormat":
        return saveFile(action.format);
      case "downloadKit":
        return saveFile("Kit");
      case "openSpec":
        return setPanel({ view: "kit" });
      default:
        return record(action);
    }
  }

  if (project === undefined) return <div className="min-h-full bg-background-2-light dark:bg-background-1-dark" />;

  const latest = (kind: ArtifactKind) => cards.findLast((card) => card.kind === kind) ?? null;
  const variations = latest("variationSet")?.data;
  const chosenMark: string | null = variations?.concepts.find((concept: { id: string }) => concept.id === variations.chosenId)?.name ?? null;
  const [placeholder, placeholderMobile] = placeholders(project.stage, latest("brief") !== null, chosenMark);

  let view: PanelView | null = null;
  if (panel?.view === "history") {
    view = { view: "history", projectName: projectName(project.brandName), phases: phasesFor(project.stage, summaries(cards, project.stage)), formats: KIT_FORMATS, kitReady: hasKit && kit != null };
  } else if (panel?.view === "memory") {
    view = { view: "memory", lines: (memories ?? []).map((memory) => ({ id: memory._id, group: memory.group, text: memory.text })) };
  } else if (panel?.view === "color") {
    const colors = latest("colorPicker")?.data.colors as { primary: string; secondary: string; tertiary: string | null } | null | undefined;
    if (colors) {
      view = {
        view: "color",
        colors: [
          { role: "Primary", use: "The mark and headlines", hex: colors.primary },
          { role: "Secondary", use: "Backgrounds and accents", hex: colors.secondary },
          ...(colors.tertiary !== null ? [{ role: "Tertiary", use: "Text and outlines", hex: colors.tertiary }] : []),
        ],
      };
    }
  } else if (panel?.view === "kit" && kit != null) {
    const spec = kit.spec as {
      clearSpace: { ratio: number };
      minimumSizes: { label: string; px: number; measure: "side" | "width" }[];
      type: { family: string; licenseName: string | null };
      colors: { role: string; hex: string; ladder: { step: string; hex: string }[] }[];
    };
    const primary = kit.files.find((entry) => entry.label === "primary, color, SVG");
    view = {
      view: "kit",
      brandName: project.brandName,
      clearSpace: {
        previewUrl: primary?.url ?? "",
        zoneColor: spec.colors[0]?.hex ?? "#000000",
        caption: `Keep clear space equal to ${Math.round(spec.clearSpace.ratio * 100)}% of the mark’s height on every side.`,
      },
      minimumSizes: spec.minimumSizes.map((size) => ({ item: size.label, value: size.measure === "width" ? `${size.px}px wide` : `${size.px}px` })),
      type: { family: spec.type.family, caption: `${spec.type.family} · the wordmark and headings.${spec.type.licenseName ? ` Free under the ${spec.type.licenseName}.` : ""}` },
      ladders: spec.colors.map((color) => ({
        role: color.role.charAt(0).toUpperCase() + color.role.slice(1),
        base: color.hex,
        steps: color.ladder.map((entry) => ({ step: Number(entry.step), hex: entry.hex })),
      })),
    };
  } else if (panel?.view === "type" && tray !== null) {
    const set = cards.find((card) => card.id === panel.messageId)?.data;
    const changing = set?.directions.find((direction: { id: string }) => direction.id === panel.cardId);
    if (set && changing) {
      // The moods Gala scored highest for this brief come first; the top two start selected.
      const weights = (set.moodWeights ?? {}) as Record<string, number>;
      const moods = [...tray.moods].sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0)).slice(0, 5);
      const selected = panel.moods ?? moods.slice(0, 2);
      view = {
        view: "type",
        letter: changing.letter,
        brandName: set.brandName,
        replacing: `Replacing ${changing.family} in direction ${changing.letter}. The other two stay as they are.`,
        categories: ["All", ...groupsOf(tray)],
        selectedCategory: panel.group,
        moods,
        selectedMoods: selected,
        sortNote: selected.length > 0 ? `Sorted by ${selected.map((mood) => mood.toLowerCase()).join(" and ")}, from Google’s own tags.` : "From Google’s own tags.",
        families: rankFamilies(tray, panel.group, selected)
          .slice(0, TRAY_LENGTH)
          .map((family) => ({ family: family.family, category: mainClass(family), current: family.family === changing.family })),
      };
    }
  }

  return (
    <StudioView
      projectName={projectName(project.brandName)}
      items={items}
      onAction={onAction}
      onOpenWork={() => setPanel({ view: "history" })}
      panel={
        view !== null ? (
          <WorkPanel
            view={view}
            onClose={() => setPanel(null)}
            onBack={() => setPanel(panel?.view === "type" ? null : { view: "history" })}
            onOpenPhase={(key) => {
              if (key === "color" && latest("colorPicker")?.data.colors) setPanel({ view: "color" });
              if (key === "kit" && kit != null) setPanel({ view: "kit" });
            }}
            onGoBack={(key) => {
              // The same move as a spoken "go back": the engine returns the project to the phase's first step, and Gala picks up in the chat.
              const step = PHASES.find((phase) => phase.key === key)?.stages[0];
              if (step === undefined || working !== null || asking.current) return;
              asking.current = true;
              void requestTurn(projectId, step).finally(() => {
                asking.current = false;
              });
            }}
            onOpenMemory={() => setPanel({ view: "memory" })}
            onChooseArtifact={() => undefined}
            onFilter={(filter) => {
              if (panel?.view !== "type" || view?.view !== "type") return;
              const current = view.selectedMoods;
              const mood = filter.mood;
              setPanel({
                ...panel,
                group: filter.category ?? panel.group,
                moods: mood === undefined ? panel.moods : current.includes(mood) ? current.filter((entry) => entry !== mood) : [...current, mood],
              });
            }}
            onUseFamily={(name) => {
              if (panel?.view !== "type" || tray === null) return;
              const family = tray.families.find((entry) => entry.family === name);
              if (family === undefined) return;
              void act({ projectId, messageId: panel.messageId as Id<"messages">, action: { type: "useFamily", id: panel.cardId, family: family.family, category: mainClass(family), moods: topMoods(family) } });
              setPanel(null);
            }}
            onDownloadFormat={saveFile}
            onAddMemory={(line) => {
              // The line shows at once; Gala's server then files it under the heading it belongs to.
              void addMemory({ group: "About you", text: line }).then((memoryId) => fileMemoryLine(memoryId, line));
            }}
            onEditMemory={(id, line) => void editMemory({ memoryId: id as Id<"memories">, text: line })}
            onRemoveMemory={(id) => void removeMemory({ memoryId: id as Id<"memories"> })}
            onClearMemory={() => void clearMemory({})}
          />
        ) : null
      }
      prompt={{
        value: text,
        onChange: setText,
        onSend: () => void sendMessage(),
        placeholder,
        placeholderMobile,
        // The bar says what Gala is doing in the first person: "I’m drawing three directions…".
        working: working === null || working === "" ? working : `I’m ${working.charAt(0).toLowerCase()}${working.slice(1)}…`,
        workingMobile: working === null || working === "" ? working : `${working}…`,
        onStop: () => void stopTurn(projectId),
        attachment: file !== null ? { fileName: file.file.name, previewUrl: file.previewUrl } : null,
        onAttach: (picked) => setFile({ file: picked, previewUrl: picked.type.startsWith("image/") ? URL.createObjectURL(picked) : null }),
        onRemoveAttachment: () => {
          if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
          setFile(null);
        },
        hints: HINTS,
        focusRequest,
      }}
    />
  );
}

/** Reads the project id from /studio/<id>, or sends the person to their logos. */
export function StudioRoute({ pathname }: { pathname: string }) {
  const { navigate } = useRouter();
  const id = pathname.replace(/^\/studio\//, "");
  if (id.length === 0 || id.includes("/")) {
    navigate("/");
    return null;
  }
  return <Studio projectId={id as Id<"projects">} />;
}
