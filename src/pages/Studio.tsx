import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { StudioView } from "../studio/StudioView";
import { WorkPanel } from "../studio/panel/WorkPanel";
import type { PanelView, Phase } from "../studio/panel/types";
import { ARTIFACT_KINDS, type ArtifactKind, type StreamItem } from "../studio/streamTypes";
import { sizeLabel } from "../studio/artifacts/Upload";
import { projectName, type Stage } from "../lib/stages";
import { useRouter } from "../lib/router";

/** The steps the History view lists, in order, with the stage each begins at. */
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

function phasesFor(stage: Stage, summaries: Record<string, string>): Phase[] {
  const current = PHASES.findIndex((phase) => phase.stages.includes(stage));
  return PHASES.map((phase, index) => ({
    key: phase.key,
    name: phase.name,
    summary: summaries[phase.key] ?? "",
    status: stage === "done" || index < current ? "done" : index === current ? "current" : "upcoming",
  }));
}

function isArtifactKind(kind: string): kind is ArtifactKind {
  return (ARTIFACT_KINDS as readonly string[]).includes(kind);
}

/**
 * One logo's studio. The conversation, uploads and memory are live; what
 * Gala says and draws arrives as messages the engine writes.
 */
export function Studio({ projectId }: { projectId: Id<"projects"> }) {
  const project = useQuery(api.projects.get, { projectId });
  const messages = useQuery(api.messages.list, { projectId });
  const memories = useQuery(api.memories.list);
  const send = useMutation(api.messages.send);
  const startUpload = useMutation(api.uploads.startUpload);
  const finishUpload = useMutation(api.uploads.finishUpload);
  const addMemory = useMutation(api.memories.add);
  const editMemory = useMutation(api.memories.edit);
  const removeMemory = useMutation(api.memories.remove);
  const clearMemory = useMutation(api.memories.clearAll);

  const [text, setText] = useState("");
  const [file, setFile] = useState<{ file: File; previewUrl: string | null } | null>(null);
  const [panel, setPanel] = useState<"history" | "memory" | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);

  const items = useMemo<StreamItem[]>(() => {
    return (messages ?? []).flatMap((message): StreamItem[] => {
      const id = message._id;
      if (message.kind === "upload" && message.upload) {
        return [{ id, kind: "upload", text: message.text ?? "", fileName: message.upload.fileName, sizeLabel: sizeLabel(message.upload.sizeBytes), imageUrl: message.upload.url }];
      }
      if (message.kind === "working") return [{ id, kind: "working", text: message.text ?? "" }];
      if (isArtifactKind(message.kind) && message.artifact !== null) {
        // The engine writes each artifact in the shape its kind names.
        return [{ id, kind: message.kind, data: message.artifact } as StreamItem];
      }
      return [{ id, kind: message.author === "gala" ? "gala" : "visitor", text: message.text ?? "" }];
    });
  }, [messages]);

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

  if (project === undefined) return <div className="min-h-full bg-background-2-light dark:bg-background-1-dark" />;

  const working = items.length > 0 && items[items.length - 1].kind === "working" ? (items[items.length - 1] as { text: string }).text : null;

  let view: PanelView | null = null;
  if (panel === "history") {
    view = { view: "history", projectName: projectName(project.brandName), phases: phasesFor(project.stage, {}), formats: KIT_FORMATS, kitReady: ["kit", "picks", "done"].includes(project.stage) };
  } else if (panel === "memory") {
    view = { view: "memory", lines: (memories ?? []).map((memory) => ({ id: memory._id, group: memory.group, text: memory.text })) };
  }

  return (
    <StudioView
      projectName={projectName(project.brandName)}
      items={items}
      onAction={(action) => {
        // Editing the brief happens in the chat: the prompt is started for the person.
        if (action.type === "editBrief") {
          setText("Change the brief: ");
          setFocusRequest((value) => value + 1);
        }
      }}
      onOpenWork={() => setPanel("history")}
      panel={
        view !== null ? (
          <WorkPanel
            view={view}
            onClose={() => setPanel(null)}
            onBack={() => setPanel("history")}
            onOpenPhase={() => undefined}
            onOpenMemory={() => setPanel("memory")}
            onChooseArtifact={() => undefined}
            onFilter={() => undefined}
            onUseFamily={() => undefined}
            onDownloadFormat={() => undefined}
            onAddMemory={(line) => void addMemory({ group: "About you", text: line })}
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
        placeholder: "Tell me about the brand you're building.",
        placeholderMobile: "Tell me about your brand.",
        working,
        workingMobile: working,
        onStop: () => undefined,
        attachment: file !== null ? { fileName: file.file.name, previewUrl: file.previewUrl } : null,
        onAttach: (picked) => setFile({ file: picked, previewUrl: picked.type.startsWith("image/") ? URL.createObjectURL(picked) : null }),
        onRemoveAttachment: () => {
          if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
          setFile(null);
        },
        hints: [],
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
