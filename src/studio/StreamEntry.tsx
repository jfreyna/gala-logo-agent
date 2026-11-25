import { GalaMessage, VisitorMessage, WorkingMessage } from "./Message";
import { Brief } from "./artifacts/Brief";
import { Research } from "./artifacts/Research";
import { Direction } from "./artifacts/Direction";
import { Upload } from "./artifacts/Upload";
import { TypeSet } from "./artifacts/TypeSet";
import { ConceptSet, VariationSet } from "./artifacts/ConceptSet";
import { StressTest } from "./artifacts/StressTest";
import { ColorPicker } from "./artifacts/ColorPicker";
import { ColorwaySet } from "./artifacts/ColorwaySet";
import { Kit } from "./artifacts/Kit";
import { Picks } from "./artifacts/Picks";
import type { ArtifactAction, StreamItem } from "./streamTypes";

/** Draws one item of the conversation. */
export function StreamEntry({ item, onAction }: { item: StreamItem; onAction: (action: ArtifactAction) => void }) {
  switch (item.kind) {
    case "gala":
      return <GalaMessage>{item.text}</GalaMessage>;
    case "visitor":
      return <VisitorMessage>{item.text}</VisitorMessage>;
    case "working":
      return <WorkingMessage>{item.text}</WorkingMessage>;
    case "upload":
      return <Upload fileName={item.fileName} sizeLabel={item.sizeLabel} imageUrl={item.imageUrl} text={item.text} />;
    case "brief":
      return <Brief data={item.data} onEdit={() => onAction({ type: "editBrief" })} />;
    case "research":
      return <Research data={item.data} />;
    case "direction":
      return <Direction data={item.data} onApprove={() => onAction({ type: "approveDirection" })} onChange={() => onAction({ type: "changeDirection" })} />;
    case "typeSet":
      return (
        <TypeSet
          data={item.data}
          onChoose={(id) => onAction({ type: "chooseType", id })}
          onChange={(id) => onAction({ type: "changeType", id })}
          onEdit={() => onAction({ type: "editType" })}
        />
      );
    case "conceptSet":
      return <ConceptSet data={item.data} onChoose={(id) => onAction({ type: "chooseConcept", id })} />;
    case "variationSet":
      return <VariationSet data={item.data} onChoose={(id) => onAction({ type: "chooseVariation", id })} />;
    case "stressTest":
      return <StressTest data={item.data} />;
    case "colorPicker":
      return <ColorPicker data={item.data} onSave={(colors) => onAction({ type: "saveColors", colors })} onEdit={() => onAction({ type: "editColors" })} />;
    case "colorwaySet":
      return <ColorwaySet data={item.data} onChoose={(id) => onAction({ type: "chooseColorway", id })} />;
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
