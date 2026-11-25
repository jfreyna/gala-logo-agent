import { GalaMessage, VisitorMessage, WorkingMessage } from "./Message";
import { Brief } from "./artifacts/Brief";
import { Research } from "./artifacts/Research";
import { Direction } from "./artifacts/Direction";
import { Upload } from "./artifacts/Upload";
import { TypeSet } from "./artifacts/TypeSet";
import { ConceptSet, VariationSet } from "./artifacts/ConceptSet";
import { StressTest } from "./artifacts/StressTest";
import { Wordmark } from "./artifacts/Wordmark";
import { Lockup } from "./artifacts/Lockup";
import { ColorPicker } from "./artifacts/ColorPicker";
import { ColorwaySet } from "./artifacts/ColorwaySet";
import { Kit } from "./artifacts/Kit";
import { Picks } from "./artifacts/Picks";
import { ActionEcho } from "./Feedback";
import type { ArtifactAction, StreamItem } from "./streamTypes";

/** Draws one item of the conversation. */
export function StreamEntry({ item, onAction }: { item: StreamItem; onAction: (action: ArtifactAction) => void }) {
  // A card whose step is past shows its footer in place of its buttons and chips; "Back to this step" goes back to it.
  const history = { past: item.past, onBack: () => onAction({ type: "backToStep" }) };
  switch (item.kind) {
    case "gala":
      return <GalaMessage>{item.text}</GalaMessage>;
    case "visitor":
      return <VisitorMessage>{item.text}</VisitorMessage>;
    case "working":
      return <WorkingMessage>{item.text}</WorkingMessage>;
    case "action":
      return <ActionEcho label={item.label} state={item.state} />;
    case "upload":
      return <Upload fileName={item.fileName} sizeLabel={item.sizeLabel} imageUrl={item.imageUrl} text={item.text} />;
    case "brief":
      return <Brief data={item.data} onEdit={() => onAction({ type: "editBrief" })} {...history} />;
    case "research":
      return <Research data={item.data} />;
    case "direction":
      return <Direction data={item.data} onApprove={() => onAction({ type: "approveDirection" })} onChange={() => onAction({ type: "changeDirection" })} {...history} />;
    case "typeSet":
      return (
        <TypeSet
          data={item.data}
          onChoose={(id) => onAction({ type: "chooseType", id })}
          onChange={(id) => onAction({ type: "changeType", id })}
          onEdit={() => onAction({ type: "editType" })}
          {...history}
        />
      );
    case "wordmark":
      return (
        <Wordmark
          data={item.data}
          onSet={(setting) => onAction({ type: "setWordmark", ...setting })}
          onChangeTypeface={() => onAction({ type: "changeTypeface" })}
          onApprove={() => onAction({ type: "approveWordmark" })}
          {...history}
        />
      );
    case "symbolOpener":
      // The opener is Gala speaking: no card, only her line.
      return <GalaMessage>{item.data.say}</GalaMessage>;
    case "conceptSet":
      return <ConceptSet data={item.data} onChoose={(id) => onAction({ type: "chooseConcept", id })} {...history} />;
    case "variationSet":
      return <VariationSet data={item.data} onChoose={(id) => onAction({ type: "chooseVariation", id })} {...history} />;
    case "stressTest":
      return <StressTest data={item.data} />;
    case "lockup":
      return (
        <Lockup
          data={item.data}
          onSet={(setting) => onAction({ type: "setLockup", ...setting })}
          onChangeSymbol={() => onAction({ type: "changeSymbol" })}
          onApprove={() => onAction({ type: "approveLockup" })}
          {...history}
        />
      );
    case "colorPicker":
      return <ColorPicker data={item.data} onSave={(colors) => onAction({ type: "saveColors", colors })} onEdit={() => onAction({ type: "editColors" })} {...history} />;
    case "colorwaySet":
      return <ColorwaySet data={item.data} onChoose={(id) => onAction({ type: "chooseColorway", id })} {...history} />;
    case "kit":
      return (
        <Kit
          data={item.data}
          onDownloadFormat={(format) => onAction({ type: "downloadFormat", format })}
          onDownloadKit={() => onAction({ type: "downloadKit" })}
          onOpenSpec={() => onAction({ type: "openSpec" })}
        />
      );
    case "picks":
      return (
        <Picks
          data={item.data}
          onSubmit={(submission) => onAction({ type: "submitPicks", ...submission })}
          onDecline={() => onAction({ type: "declinePicks" })}
        />
      );
  }
}
