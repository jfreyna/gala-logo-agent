import { useState } from "react";
import { Home } from "../pages/Home";
import { JoinCard } from "../components/JoinCard";
import { ProjectsView } from "../pages/Projects";
import { StudioView } from "../studio/StudioView";
import { WorkPanel } from "../studio/panel/WorkPanel";
import { HeroGlows } from "../backdrops/HeroGlows";
import { HallsHorizon } from "../backdrops/HallsHorizon";
import { AboutRibbons } from "../backdrops/AboutRibbons";
import { halls, panels, projects, screens } from "./fixtures";
import { STEP_FACTS } from "../../engine/stepFacts";
import type { Stage } from "../lib/stages";
import { States } from "./States";

/** Each backdrop and the height of its stage, in frame pixels (the stage is 1440 wide). */
const BACKDROPS = {
  "hero-silk": { Scene: HeroGlows, height: 850 },
  "halls-horizon": { Scene: HallsHorizon, height: 523 },
  "about-ribbons": { Scene: AboutRibbons, height: 1346 },
} as const;

/**
 * Development only: each designed screen with the frames' sample content,
 * for the side-by-side check against Figma. The address picks the screen:
 *   /preview/home
 *   /preview/projects
 *   /preview/states              (every button kind and chip in each state, for scripts/check-states.mjs)
 *   /preview/backdrop?scene=hero-silk   (one backdrop alone at its frame's size: hero-silk, halls-horizon, about-ribbons;
 *                                        &width=N draws it N wide, &below=N puts it N pixels down the page)
 *   /preview/joincard?state=signIn   (the join card's sign-in states)
 *   /preview/<screen>            (studio, brief, research, type, directions, ...)
 *   /preview/<screen>?panel=<view>   (history, artifact, color, type, kit, memory)
 *   add &working=1 or &attached=1 for those prompt bar states, &status=<line> for a working line of your own,
 *   &family=<Google family> sets the wordmark card in that typeface, and &name=<text> changes the name on it,
 *   &skip=N to leave out the first N items, &top=1 to show the start of a long conversation,
 *   &attached=1&file=<name> for an attached file, &sendError=<reason> for the bar's Send failed state,
 *   &handedOff=1 for the bar's Handed off state, &downloads=SVG:saved,PNG:couldnt for the kit's download chips,
 *   &busy=1 for past cards while Gala works
 */
export function Preview({ pathname, search }: { pathname: string; search: string }) {
  const name = pathname.replace(/^\/preview\/?/, "") || "studio";
  const params = new URLSearchParams(search);
  const [value, setValue] = useState(params.get("typing") ?? "");
  const [panelName, setPanelName] = useState<string | null>(params.get("panel"));

  if (name === "home") {
    // ?pin=1 shows the two tiles the frame draws open; ?modal=fame opens the full view.
    const pin = params.get("pin") === "1";
    const open = (entries: typeof halls.fame, id: string) => entries.map((entry) => ({ ...entry, pinnedOpen: pin && entry.id === id }));
    const modal = params.get("modal");
    return <Home sample={{ fame: open(halls.fame, "f3"), shame: open(halls.shame, "s5") }} sampleOpen={modal === "fame" || modal === "shame" ? modal : undefined} />;
  }
  if (name === "backdrop") {
    const backdrop = BACKDROPS[(params.get("scene") ?? "") as keyof typeof BACKDROPS];
    if (backdrop === undefined) return <p style={{ padding: 24 }}>No backdrop named “{params.get("scene")}”. Try: {Object.keys(BACKDROPS).join(", ")}.</p>;
    const width = Number(params.get("width") ?? 1440);
    const below = Number(params.get("below") ?? 0);
    return (
      <div style={{ paddingTop: below, paddingBottom: below }}>
        <div style={{ position: "relative", width, height: (width * backdrop.height) / 1440 }}>
          <backdrop.Scene className="left-0 top-0 h-full w-full" />
        </div>
      </div>
    );
  }
  if (name === "joincard") {
    // The join card alone, in one of its sign-in states: ?state=signIn|signingIn|signInError, &set=1 for the Password set line.
    const state = params.get("state");
    const filled = state === "signingIn" || state === "signInError";
    return (
      <JoinCard
        start={{
          state: state === "signingIn" || state === "signInError" ? state : "signIn",
          passwordSet: params.get("set") === "1",
          email: filled ? "you@emberandrye.com" : "",
          password: filled ? "••••••••••" : "",
        }}
      />
    );
  }
  if (name === "states") return <States />;
  if (name === "projects") {
    return <ProjectsView onNew={() => undefined} projects={projects.map((project, index) => ({ id: `sample-${index}`, ...project }))} />;
  }

  const screen = screens[name];
  if (!screen) return <p style={{ padding: 24 }}>No preview named “{name}”. Try: {Object.keys(screens).join(", ")}.</p>;
  const named = panelName !== null ? panels[panelName.replace("-confirm", "")] : undefined;
  const view = named && named.view === "memory" && panelName === "memory-confirm" ? { ...named, confirming: true } : named;
  // &status=<a working line> shows that line the way the live studio phrases it for the bar.
  const status = params.get("status");
  const working: [string, string] | null =
    status !== null
      ? [`I’m ${status.charAt(0).toLowerCase()}${status.slice(1)}…`, `${status}…`]
      : params.get("working") === "1"
        ? (screen.working ?? ["I’m drawing three directions…", "Drawing three directions…"])
        : null;
  const noop = () => undefined;
  const downloads = params.get("downloads")
    ? (Object.fromEntries(params.get("downloads")!.split(",").map((entry) => entry.split(":"))) as Record<string, "idle" | "saving" | "saved" | "couldnt">)
    : undefined;

  return (
    <StudioView
      projectName="Ember & Rye"
      items={screen.items.slice(Number(params.get("skip") ?? 0)).map((item) =>
        // &family and &name show the wordmark card in another typeface or with another name.
        item.kind === "wordmark"
          ? { ...item, data: { ...item.data, family: params.get("family") ?? item.data.family, brandName: params.get("name") ?? item.data.brandName } }
          : // &downloads=SVG:saved,EPS:saving,PNG:couldnt shows the kit's download chips in those states.
            item.kind === "kit" && downloads !== undefined
            ? { ...item, downloads }
            : // &reply=Working|Done shows the reply buttons in that state; Working with the first button pressed.
              item.reply !== undefined && (params.get("reply") === "Working" || params.get("reply") === "Done")
              ? { ...item, reply: { ...item.reply, view: { ...item.reply.view, state: params.get("reply") as "Working" | "Done", pressed: params.get("reply") === "Working" ? "primary" : null } } }
              : // &approved=1 shows the stress test card once approved.
                item.kind === "stressTest" && params.get("approved") === "1"
                ? { ...item, data: { ...item.data, approved: true } }
                : // &busy=1 shows past cards as they are while Gala works: going back waits.
              item.past !== undefined && params.get("busy") === "1"
              ? { ...item, past: { ...item.past, working: true } }
              : item,
      )}
      onAction={noop}
      startAtTop={params.get("top") === "1"}
      restAtBottom={params.get("bottom") === "1"}
      menuOpen={params.get("menu") === "1"}
      onOpenWork={() => setPanelName("history")}
      panel={
        view ? (
          <WorkPanel
            view={view}
            onClose={() => setPanelName(null)}
            onBack={() => setPanelName("history")}
            onOpenPhase={() => setPanelName("artifact")}
            onGoBack={() => undefined}
            onOpenMemory={() => setPanelName("memory")}
            onChooseArtifact={noop}
            onFilter={noop}
            onUseFamily={noop}
            onDownloadFormat={noop}
            onAddMemory={noop}
            onEditMemory={noop}
            onRemoveMemory={noop}
            onClearMemory={noop}
          />
        ) : null
      }
      prompt={{
        value,
        onChange: setValue,
        onSend: noop,
        placeholder: screen.placeholder,
        placeholderMobile: screen.placeholderMobile,
        working: working ? working[0] : null,
        workingMobile: working ? working[1] : null,
        onStop: noop,
        attachment: params.get("attached") === "1" ? { fileName: params.get("file") ?? "napkin-sketch.jpg", previewUrl: null } : null,
        // &sendError=<message> shows the bar's Send failed state with that reason under it.
        sendError: params.get("sendError"),
        // &handedOff=1 shows the bar as a card action leaves it (Handed off).
        handedOff: params.get("handedOff") === "1",
        onAttach: noop,
        onRemoveAttachment: noop,
        canAttach: screen.atBrief === true,
        // &stage=<stage> shows that step's Hints; the brief's otherwise.
        hints: STEP_FACTS[(params.get("stage") as Stage | null) ?? "brief"]?.hints ?? STEP_FACTS.brief.hints,
        hintsOpen: params.get("hints") === "1",
      }}
    />
  );
}
