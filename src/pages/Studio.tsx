import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { StudioView } from "../studio/StudioView";
import { promptFor } from "../studio/promptFor";
import { repliesFor } from "../studio/replies";
import { STEP_FACTS } from "../../engine/stepFacts";
import { WorkPanel } from "../studio/panel/WorkPanel";
import type { PanelView, Phase } from "../studio/panel/types";
import { ARTIFACT_KINDS, type ArtifactAction, type ArtifactKind, type StreamItem } from "../studio/streamTypes";
import { sizeLabel } from "../studio/artifacts/Upload";
import { projectName, type Stage } from "../lib/stages";
import { useRouter } from "../lib/router";
import { download, fileMemoryLine, requestTurn, stopTurn } from "../lib/turn";
import { groupsOf, mainClass, rankFamilies, topMoods, useTrayData } from "../lib/typeTray";
import { pastCards } from "../studio/history";
import { ECHO_KIND, echoFor, type EchoAction } from "../../convex/lib/echo";
import { echoState } from "../studio/echoState";
import { messageOf } from "../lib/errors";
import { ConvexError } from "convex/values";
import type { DownloadState, NoticeAction } from "../studio/Feedback";
import { HAND_OFF_MS, handsOff } from "../studio/handoff";
import { afterRequest, couldNotStart, noticeOf, sendKeepingInput } from "../studio/failures";
import { kitView, type KitSpecData } from "../studio/panel/colorway";

/** The steps the History view lists, in order, with the stages each covers. */
const PHASES: { key: string; name: string; stages: Stage[] }[] = [
  { key: "brief", name: "Brief", stages: ["brief"] },
  { key: "research", name: "Research", stages: ["research"] },
  { key: "type", name: "Type", stages: ["type"] },
  { key: "wordmark", name: "Wordmark", stages: ["wordmark"] },
  // The symbol opener is where the directions begin: Gala asks what to draw before drawing three.
  { key: "directions", name: "Directions", stages: ["symbolOpener", "directions"] },
  { key: "variations", name: "Variations", stages: ["variations"] },
  { key: "stressTest", name: "Stress test", stages: ["stressTest"] },
  { key: "lockup", name: "Lockup", stages: ["lockup"] },
  { key: "color", name: "Color", stages: ["pickColors", "colorways"] },
  { key: "kit", name: "Kit", stages: ["kit", "picks", "done"] },
];

const KIT_FORMATS = ["SVG", "EPS", "PNG", "Square", "Social"];


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

/** How the Wordmark row says the case ("Ember & Rye in Young Serif, as typed"). */
const CASE_WORDS: Record<string, string> = { asTyped: "as typed", allCaps: "all caps", lowercase: "lowercase" };

/** The line under each step in the History view. */
function summaries(cards: Card[], stage: Stage): Record<string, { summary: string; thumbs?: string[] }> {
  const latest = (kind: ArtifactKind) => cards.findLast((card) => card.kind === kind)?.data;
  const chosen = (set: Record<string, any> | undefined, list: string) => set?.[list]?.find((entry: { id: string }) => entry.id === set.chosenId);
  const result: Record<string, { summary: string; thumbs?: string[] }> = {
    variations: { summary: "Three refinements of your pick" },
    stressTest: { summary: "16px, circle, inverted, poster" },
    lockup: { summary: "Symbol and wordmark, side by side and stacked" },
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
  const wordmark = latest("wordmark");
  if (wordmark) result.wordmark = { summary: `${wordmark.brandName} in ${wordmark.family}, ${CASE_WORDS[wordmark.case as string] ?? CASE_WORDS.asTyped}` };
  const lockup = latest("lockup");
  if (lockup && lockup.approved) result.lockup = { summary: `${lockup.markName} with ${lockup.brandName}, ${lockup.layout === "stacked" ? "stacked" : "side by side"}` };
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
  // The line a card action leaves, shown the instant the click lands, until `act` has stored it (gala-action-echo, Sending).
  const [pending, setPending] = useState<{ key: number; label: string }[]>([]);
  // The server's own message for what failed, under the control it came from (gala-inline-error), until the next action there.
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  /** A reply button this page pressed, by the message it sits under, until the stored conversation shows it (FRI-1722). */
  const [replyPress, setReplyPress] = useState<Record<string, "primary" | "secondary">>({});
  const [memoryErrors, setMemoryErrors] = useState<Record<string, string>>({});
  const [sendError, setSendError] = useState<string | null>(null);
  // A failed Stop request (FRI-1715): its words under the bar, until the next press.
  const [stopError, setStopError] = useState<string | null>(null);
  // Handed off (FRI-1715): a card action passed the next move to the message box. Off when the person types, or after 6 seconds.
  const [handedOff, setHandedOff] = useState(0);
  useEffect(() => {
    if (handedOff === 0) return;
    const timer = window.setTimeout(() => setHandedOff(0), HAND_OFF_MS);
    return () => window.clearTimeout(timer);
  }, [handedOff]);
  // Where each kit download stands (gala-download-chip), by format, and "Kit" for Download kit.
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  // The kit cards whose first finished download was already reported to Gala, in this page's life.
  const downloadReported = useRef(new Set<string>());
  // How the last request for a turn ended, once the retries ran out without a turn starting.
  const [startFailed, setStartFailed] = useState<string | null>(null);
  const nextEcho = useRef(0);
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
      setStartFailed(null);
      return;
    }
    if (asking.current || startFailed !== null) return;
    asking.current = true;
    let retry: number | undefined;
    void requestTurn(projectId).then((state) => {
      asking.current = false;
      // Out of retries and no turn began: say so, with Try again, instead of stopping without a word.
      const next = afterRequest(state, attempt, TURN_RETRIES);
      if (next.next === "retry") retry = window.setTimeout(() => setAttempt(attempt + 1), next.afterMs);
      if (next.next === "couldNotStart") setStartFailed(next.reason);
    });
    return () => window.clearTimeout(retry);
  }, [owed, projectId, attempt, startFailed]);

  const cards = useMemo<Card[]>(
    () => (messages ?? []).flatMap((message) => (isArtifactKind(message.kind) && message.artifact !== null ? [{ id: message._id, kind: message.kind, data: message.artifact as Record<string, any> }] : [])),
    [messages],
  );

  const stage = project?.stage;
  const items = useMemo<StreamItem[]>(() => {
    const all = messages ?? [];
    // Cards whose step is past show their footer in place of their buttons and chips.
    const plain = all.map((message) => ({ id: message._id, author: message.author, kind: message.kind, artifact: message.artifact as Record<string, any> | null }));
    const past = stage === undefined ? {} : pastCards(plain, stage);
    // Reply buttons under the lines that offered a move, and Go ahead under the symbol opener (FRI-1722).
    const replies = repliesFor(plain, replyPress, stage === "symbolOpener");
    const stream = all.flatMap((message, at): StreamItem[] => {
      const id = message._id;
      if (message.kind === "notice" && message.author === "gala" && message.artifact !== null) {
        return [{ id, kind: "notice", notice: noticeOf(message.artifact as Record<string, any>) }];
      }
      if (message.kind === ECHO_KIND && message.artifact !== null) {
        // Sending until Gala's working line appears, anything is written after it, or the turn it asked for has ended (echoState.ts).
        const echo = message.artifact as { sending: string; sent: string; wakes: boolean };
        const state = echoState({ wakes: echo.wakes, later: all.slice(at + 1), working, waitingOnGala: project?.waitingOnGala === true });
        return [{ id, kind: "action", label: state === "Sending" ? echo.sending : echo.sent, state }];
      }
      if (message.kind === "upload" && message.upload) {
        return [{ id, kind: "upload", text: message.text ?? "", fileName: message.upload.fileName, sizeLabel: sizeLabel(message.upload.sizeBytes), imageUrl: message.upload.url }];
      }
      if (isArtifactKind(message.kind) && message.artifact !== null) {
        // The engine writes each artifact in the shape its kind names.
        // While Gala works, a past card's "Back to this step" waits, and says so.
        const history = past[id] === undefined ? undefined : { ...past[id], working: working !== null };
        return [{ id, kind: message.kind, data: message.artifact, past: history, error: cardErrors[id], downloads: message.kind === "kit" ? downloads : undefined, reply: replies[id] } as unknown as StreamItem];
      }
      if (message.author === "gala") return [{ id, kind: "gala", text: message.text ?? "", reply: replies[id], error: cardErrors[id] }];
      return [{ id, kind: "visitor", text: message.text ?? "" }];
    });
    for (const echo of pending) stream.push({ id: `echo-${echo.key}`, kind: "action", label: echo.label, state: "Sending" });
    if (startFailed !== null) {
      const lastSaid = all.findLast((message) => message.author === "visitor");
      stream.push({ id: "couldnt-start", kind: "notice", notice: couldNotStart(startFailed, lastSaid?.kind === ECHO_KIND ? "choice" : "message") });
    }
    // Gala's "working" line, while a turn runs.
    if (working !== null) stream.push({ id: "working", kind: "working", text: working });
    return stream;
  }, [messages, working, pending, stage, cardErrors, startFailed, downloads, project?.waitingOnGala, replyPress]);

  /**
   * Sends the message and the file. The box and the attachment are cleared
   * only once the send went through; if it fails, both stay, the bar shows
   * Send failed, and the reason is under it (FRI-1712 pattern 6).
   */
  async function sendMessage() {
    const words = text.trim();
    const attached = file;
    if (words.length === 0 && attached === null) return;
    setSendError(null);
    const failed = await sendKeepingInput({
      words,
      attached: attached === null ? null : { name: attached.file.name },
      upload: async () => {
        const address = await startUpload({ projectId });
        const response = await fetch(address, { method: "POST", headers: { "Content-Type": attached!.file.type }, body: attached!.file });
        if (!response.ok) throw new Error("The file did not upload.");
        const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
        return finishUpload({ projectId, fileId: storageId, fileName: attached!.file.name });
      },
      send: (uploadId) => send({ projectId, text: words, uploadId: uploadId as Id<"uploads"> | undefined }),
      messageOf,
    });
    if (failed !== null) {
      setSendError(failed);
      return;
    }
    setText((current) => (current.trim() === words ? "" : current));
    setFile((current) => {
      if (current !== attached) return current;
      if (attached?.previewUrl) URL.revokeObjectURL(attached.previewUrl);
      return null;
    });
  }

  /** Saves one of the kit's files: Saving while it is fetched, Saved for a few seconds, or Couldn't, which a press tries again. */
  function saveFile(label: string) {
    const entry = kit?.downloads.find((candidate) => candidate.label === label);
    const mark = (state: DownloadState) => setDownloads((current) => ({ ...current, [label]: state }));
    if (!entry?.url) return mark("couldnt");
    mark("saving");
    void download(entry.url, entry.fileName).then((saved) => {
      mark(saved ? "saved" : "couldnt");
      if (saved) window.setTimeout(() => setDownloads((current) => (current[label] === "saved" ? { ...current, [label]: "idle" } : current)), 3000);
      if (saved) reportDownloaded();
    });
  }

  /**
   * The first finished download tells Gala, once per kit card, so the halls
   * card can follow it (FRI-1723). The card's `downloaded` mark survives a
   * reload; the ref covers the moment before the mark comes back. If the
   * call fails, the next download tries again, and the person's next
   * message brings the halls card anyway.
   */
  function reportDownloaded() {
    const kitCard = cards.findLast((card) => card.kind === "kit");
    if (kitCard === undefined || kitCard.data.downloaded === true || downloadReported.current.has(kitCard.id)) return;
    downloadReported.current.add(kitCard.id);
    void act({ projectId, messageId: kitCard.id as Id<"messages">, action: { type: "kitDownloaded" } }).catch(() => downloadReported.current.delete(kitCard.id));
  }



  /** Goes back to a step: the same move as a spoken "go back". The engine returns the project to it, and Gala picks up in the chat. */
  function goBack(step: Stage) {
    if (working !== null || asking.current) return;
    asking.current = true;
    void requestTurn(projectId, step).finally(() => {
      asking.current = false;
    });
  }

  /**
   * Stores a card action. Its line in the chat shows at once (Sending), and
   * gives way to the one `act` stores with the action.
   */
  function record(messageId: Id<"messages">, recorded: Parameters<typeof act>[0]["action"]) {
    const card = cards.find((entry) => entry.id === messageId)?.data ?? null;
    const echo = echoFor(recorded as EchoAction, card);
    const key = nextEcho.current++;
    if (echo !== null) setPending((list) => [...list, { key, label: echo.sending }]);
    // A new action on the card clears its last error; a refusal shows the server's words under the card.
    setCardErrors(({ [messageId]: _, ...rest }) => rest);
    void act({ projectId, messageId, action: recorded })
      .catch((error) => setCardErrors((errors) => ({ ...errors, [messageId]: messageOf(error) })))
      .finally(() => setPending((list) => list.filter((entry) => entry.key !== key)));
  }

  /**
   * "Finish in the kit" (FRI-1722): moves nothing. It brings the kit card
   * into view and outlines it the way a hand-off outlines the message box
   * (FRI-1715: a 2px button-1 line, off after the same 6 seconds).
   */
  function showKit() {
    const kits = document.querySelectorAll<HTMLElement>('[data-name="gala-kit"]');
    const card = kits[kits.length - 1];
    if (card === undefined) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    const outline = ["outline", "outline-2", "outline-offset-4", "outline-button-1-default-light", "dark:outline-button-1-default-dark", "rounded-[16px]"];
    card.classList.add(...outline);
    window.setTimeout(() => card.classList.remove(...outline), HAND_OFF_MS);
  }

  /** A reply button: shows Working under its line, then stores the action on the card that holds the move. A refusal puts the row back. */
  function pressReply(lineId: string, which: "primary" | "secondary", cardId: Id<"messages">, recorded: Parameters<typeof act>[0]["action"]) {
    if (working !== null) return;
    setReplyPress((presses) => ({ ...presses, [lineId]: which }));
    const card = cards.find((entry) => entry.id === cardId)?.data ?? null;
    const echo = echoFor(recorded as EchoAction, card);
    const key = nextEcho.current++;
    if (echo !== null) setPending((list) => [...list, { key, label: echo.sending }]);
    setCardErrors(({ [lineId]: _, ...rest }) => rest);
    void act({ projectId, messageId: cardId, action: recorded })
      .catch((error) => {
        setReplyPress(({ [lineId]: _, ...rest }) => rest);
        setCardErrors((errors) => ({ ...errors, [lineId]: messageOf(error) }));
      })
      .finally(() => setPending((list) => list.filter((entry) => entry.key !== key)));
  }

  /** Try again, on a notice: asks for the turn once more. A turn still owed starts its requests over. */
  function retry() {
    if (startFailed !== null) {
      setStartFailed(null);
      setAttempt(0);
      return;
    }
    if (working !== null || asking.current) return;
    asking.current = true;
    void requestTurn(projectId).finally(() => {
      asking.current = false;
    });
  }

  /** A notice's button: go back a step, show the type card waiting for a pick, try again, or hand the next move to the message box. */
  function onNotice(action: NoticeAction) {
    if (action.do === "back") return goBack(action.step as Stage);
    if (action.do === "retry") return retry();
    if (action.do === "showType") {
      const cardsOnPage = document.querySelectorAll('[data-name="gala-type-set"]');
      return cardsOnPage[cardsOnPage.length - 1]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setFocusRequest((value) => value + 1);
  }

  /** Runs a memory action; its failure shows under the control it came from, until the next action there. */
  function remember(control: string, run: () => Promise<unknown>) {
    setMemoryErrors(({ [control]: _, ...rest }) => rest);
    void run().catch((error) => setMemoryErrors((errors) => ({ ...errors, [control]: messageOf(error) })));
  }

  function onAction(action: ArtifactAction, itemId: string) {
    const messageId = itemId as Id<"messages">;
    // "Change something", "Edit" on the brief, and "Tell me what to try" hand the next move to the box, and the bar shows it.
    if (handsOff(action)) setHandedOff(Date.now());
    switch (action.type) {
      // "Back to this step" on a past card's footer: the same path as the Work panel's link.
      case "notice":
        return onNotice(action.action);
      case "backToStep": {
        const step = items.find((item) => item.id === itemId)?.past?.backTo;
        if (step != null) goBack(step);
        return;
      }
      // Editing the brief, or the direction, happens in the chat: the prompt is readied for the person.
      case "editBrief":
        setText("Change the brief: ");
        return setFocusRequest((value) => value + 1);
      case "changeDirection":
      case "changeMark":
        return setFocusRequest((value) => value + 1);
      // A reply button: Working at once, and the same move typing the answer makes (FRI-1722).
      case "answerOffer":
        return pressReply(itemId, action.answer === "yes" ? "primary" : "secondary", action.cardId as Id<"messages">, { type: "answerOffer", answer: action.answer });
      case "goAhead":
        return pressReply(itemId, "primary", messageId, { type: "goAhead" });
      case "takeWayOut": {
        const row = items.find((item) => item.id === itemId)?.reply?.view;
        return pressReply(itemId, row?.secondary === null ? "primary" : "secondary", action.cardId as Id<"messages">, { type: "takeWayOut" });
      }
      case "finishInKit":
        return showKit();
      case "changeType":
        return setPanel({ view: "type", messageId, cardId: action.id, group: "All", moods: null });
      // "Change typeface" and "Change symbol" take the same path as going back to that step.
      case "changeTypeface":
        return goBack("type");
      case "changeSymbol":
        return goBack("directions");
      case "saveColors":
        return record(messageId, { type: "saveColors", primary: action.colors.primary, secondary: action.colors.secondary, tertiary: action.colors.tertiary });
      case "downloadFormat":
        return saveFile(action.format);
      case "downloadKit":
        return saveFile("Kit");
      case "openSpec":
        return setPanel({ view: "kit" });
      default:
        return record(messageId, action);
    }
  }

  if (project === undefined) return <div className="min-h-full bg-background-2-light dark:bg-background-1-dark" />;

  const latest = (kind: ArtifactKind) => cards.findLast((card) => card.kind === kind) ?? null;
  const bar = promptFor(project.stage, latest("brief") !== null);

  let view: PanelView | null = null;
  if (panel?.view === "history") {
    view = { view: "history", projectName: projectName(project.brandName), phases: phasesFor(project.stage, summaries(cards, project.stage)), formats: KIT_FORMATS, kitReady: hasKit && kit != null, downloads, working: working !== null };
  } else if (panel?.view === "memory") {
    view = { view: "memory", lines: (memories ?? []).map((memory) => ({ id: memory._id, group: memory.group, text: memory.text })), errors: memoryErrors };
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
    view = kitView(project.brandName, kit.spec as KitSpecData, (label) => kit.files.find((entry) => entry.label === label)?.url ?? undefined);
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
              const step = PHASES.find((phase) => phase.key === key)?.stages[0];
              if (step !== undefined) goBack(step);
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
              record(panel.messageId as Id<"messages">, { type: "useFamily", id: panel.cardId, family: family.family, category: mainClass(family), moods: topMoods(family) });
              setPanel(null);
            }}
            onDownloadFormat={saveFile}
            onAddMemory={(line) =>
              // The line shows at once; Gala's server then files it under the heading it belongs to.
              remember("add", async () => {
                const memoryId = await addMemory({ group: "About you", text: line });
                if (!(await fileMemoryLine(memoryId, line))) throw new ConvexError("I kept that line, but couldn’t file it under its heading, so it sits under About you for now.");
              })
            }
            onEditMemory={(id, line) => remember(id, () => editMemory({ memoryId: id as Id<"memories">, text: line }))}
            onRemoveMemory={(id) => remember(id, () => removeMemory({ memoryId: id as Id<"memories"> }))}
            onClearMemory={() => remember("clear", () => clearMemory({}))}
          />
        ) : null
      }
      prompt={{
        value: text,
        onChange: (value) => {
          setText(value);
          setSendError(null);
          setHandedOff(0);
        },
        sendError: sendError ?? stopError,
        sendFailed: sendError !== null,
        handedOff: handedOff !== 0,
        onSend: () => void sendMessage(),
        placeholder: bar.placeholder,
        placeholderMobile: bar.placeholderMobile,
        // The bar says what Gala is doing in the first person: "I’m drawing three directions…".
        working: working === null || working === "" ? working : `I’m ${working.charAt(0).toLowerCase()}${working.slice(1)}…`,
        workingMobile: working === null || working === "" ? working : `${working}…`,
        onStop: () => {
          setStopError(null);
          void stopTurn(projectId).then((stopped) => {
            if (!stopped) setStopError("I couldn’t stop that. Press Stop again.");
          });
        },
        attachment: file !== null ? { fileName: file.file.name, previewUrl: file.previewUrl } : null,
        onAttach: (picked) => {
          setSendError(null);
          setFile({ file: picked, previewUrl: picked.type.startsWith("image/") ? URL.createObjectURL(picked) : null });
        },
        canAttach: bar.canAttach,
        onRemoveAttachment: () => {
          setSendError(null);
          if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
          setFile(null);
        },
        // The step's Hints, from the same table as what Gala knows the step can do (engine/stepFacts.ts, FRI-1722).
        hints: STEP_FACTS[project.stage].hints,
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
