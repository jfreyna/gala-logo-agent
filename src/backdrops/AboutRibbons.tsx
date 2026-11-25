import type { CSSProperties } from "react";
import { useTheme, type Mode } from "../lib/theme";
import { FALLOFFS } from "./falloffs";
import { ABOUT_BOTTOM_BAND, ABOUT_MIDDLE_BAND, ABOUT_MIDDLE_CREASE_LEFT, ABOUT_MIDDLE_CREASE_RIGHT, ABOUT_MIDDLE_FOLD, ABOUT_TOP_BAND, ABOUT_TOP_CREASE } from "./paths";
import { Glow, Linear, Piece, Scene, Sweep, type Box, type Stop } from "./Scene";

const HEIGHT = 1346;

type Blend = "normal" | "multiply" | "screen";

/** Colors and blend modes from "About / Frame 3" in the light and dark frames (5595:14355, 5595:14422). */
const PALETTE: Record<
  Mode,
  {
    page: string;
    left: [string, number];
    right: [string, number];
    glowBlend: "normal" | "screen";
    bandBlend: Blend;
    top: Stop[];
    middle: Stop[];
    bottom: Stop[];
  }
> = {
  light: {
    page: "#f6fafc",
    left: ["254 217 128", 0.6],
    right: ["236 224 255", 1],
    glowBlend: "normal",
    bandBlend: "multiply",
    top: [[0, "#B9D700", 0], [0.2, "#B9D700", 0.9], [0.5, "#D1EF1D"], [0.8, "#8DB3C4", 0.9], [1, "#8DB3C4", 0]],
    middle: [[0, "#B79CE3", 0], [0.2, "#8A4DED", 0.9], [0.5, "#B79CE3", 0.95], [0.8, "#FED980", 0.9], [1, "#FED980", 0]],
    bottom: [[0, "#8DB3C4", 0], [0.3, "#8DB3C4", 0.8], [0.7, "#E7FF57", 0.85], [1, "#E7FF57", 0]],
  },
  dark: {
    page: "#021c29",
    left: ["127 85 195", 0.45],
    right: ["59 113 135", 0.55],
    glowBlend: "screen",
    bandBlend: "normal",
    top: [[0, "#B9D700", 0], [0.2, "#B9D700", 0.9], [0.5, "#D1EF1D"], [0.8, "#6C97AA", 0.9], [1, "#6C97AA", 0]],
    middle: [[0, "#D4C1F0", 0], [0.2, "#B79CE3", 0.9], [0.5, "#D4C1F0", 0.95], [0.8, "#FED980", 0.8], [1, "#FED980", 0]],
    bottom: [[0, "#6C97AA", 0], [0.3, "#6C97AA", 0.8], [0.7, "#D1EF1D", 0.85], [1, "#D1EF1D", 0]],
  },
};

const CREASE: Stop[] = [[0, "white", 0], [0.2, "white", 0.5], [0.8, "white", 0.5], [1, "white", 0]];

type Ribbon = {
  name: "top" | "middle" | "bottom";
  box: Box;
  band: string;
  /** Both ends of the band's own gradient: the line the ribbon runs along. */
  along: [[number, number], [number, number]];
  /** The shade on the underside of the fold: its color, and the two ends of its gradient. */
  shade: { color: string; strength: number; from: [number, number]; to: [number, number] };
  /** The shade past the twist, on the ribbon that has one. */
  fold?: string;
  creases: string[];
};

const RIBBONS: Ribbon[] = [
  {
    name: "top",
    box: { x: -91, y: 72, width: 1623, height: 822 },
    band: ABOUT_TOP_BAND,
    along: [[-80, 814], [1520, 154]],
    shade: { color: "#525E05", strength: 0.35, from: [564, 534], to: [471, 404] },
    creases: [ABOUT_TOP_CREASE],
  },
  {
    name: "middle",
    box: { x: -96, y: 179, width: 1628, height: 868 },
    band: ABOUT_MIDDLE_BAND,
    along: [[-80, 934], [1520, 294]],
    shade: { color: "#3D1878", strength: 0.4, from: [577, 671], to: [488, 527] },
    fold: ABOUT_MIDDLE_FOLD,
    creases: [ABOUT_MIDDLE_CREASE_LEFT, ABOUT_MIDDLE_CREASE_RIGHT],
  },
  {
    name: "bottom",
    box: { x: -88, y: 383, width: 1618, height: 712 },
    band: ABOUT_BOTTOM_BAND,
    along: [[-80, 1034], [1520, 444]],
    shade: { color: "#1D576F", strength: 0.3, from: [584, 775], to: [541, 695] },
    creases: [],
  },
];

/** Seconds between one ribbon's sweep and the next: a third of the 25-second turn. */
const TURN = 25 / 3;

/**
 * The About page's backdrop: two glows and three ribbons.
 *
 * The glows breathe. The ribbons hold still: a highlight sweeps each in
 * turn, so one is lit at a time.
 */
export function AboutRibbons({ className }: { className: string }) {
  const { mode } = useTheme();
  const palette = PALETTE[mode];
  return (
    <Scene name="about-ribbons" height={HEIGHT} page={palette.page} className={className}>
      <Glow falloff={FALLOFFS.aboutLeft} at={[420, 514]} color={palette.left[0]} strength={palette.left[1]} blend={palette.glowBlend} phase={0} stageHeight={HEIGHT} />
      <Glow falloff={FALLOFFS.aboutRight} at={[990, 514]} color={palette.right[0]} strength={palette.right[1]} blend={palette.glowBlend} phase={5} stageHeight={HEIGHT} />

      {RIBBONS.map((ribbon, index) => [
        <Piece key={`${ribbon.name}-band`} name={`${ribbon.name}-band`} box={ribbon.box} stageHeight={HEIGHT} blend={palette.bandBlend}>
          <defs>
            <Linear id={`bd-about-${ribbon.name}-band`} from={ribbon.along[0]} to={ribbon.along[1]} stops={palette[ribbon.name]} />
          </defs>
          <path d={ribbon.band} fill={`url(#bd-about-${ribbon.name}-band)`} />
        </Piece>,
        <Piece key={`${ribbon.name}-shade`} name={`${ribbon.name}-shades`} box={ribbon.box} stageHeight={HEIGHT} blend="multiply">
          <defs>
            <Linear
              id={`bd-about-${ribbon.name}-shade`}
              from={ribbon.shade.from}
              to={ribbon.shade.to}
              stops={[[0, ribbon.shade.color, 0], [0.55, ribbon.shade.color, 0], [1, ribbon.shade.color, ribbon.shade.strength]]}
            />
            <Linear id={`bd-about-${ribbon.name}-fold`} from={ribbon.along[0]} to={ribbon.along[1]} stops={[[0, "#3D1878", 0], [0.52, "#3D1878", 0], [0.6, "#3D1878", 0.16], [1, "#3D1878", 0.1]]} />
          </defs>
          {/* Shades that all multiply: one layer that multiplies gives the same result as one each. */}
          <path d={ribbon.band} fill={`url(#bd-about-${ribbon.name}-shade)`} />
          {ribbon.fold !== undefined && <path d={ribbon.fold} fill={`url(#bd-about-${ribbon.name}-fold)`} style={{ mixBlendMode: "multiply" }} />}
        </Piece>,
        <Sweep
          key={`${ribbon.name}-sweep`}
          name={`${ribbon.name}-light`}
          box={ribbon.box}
          outline={ribbon.band}
          along={ribbon.along}
          stageHeight={HEIGHT}
          className="bd-sweep-turns"
          style={{ "--bd-wait": `${(1 + index * TURN).toFixed(2)}s` } as CSSProperties}
        />,
        ribbon.creases.length > 0 && (
          <Piece key={`${ribbon.name}-crease`} name={`${ribbon.name}-creases`} box={ribbon.box} stageHeight={HEIGHT}>
            <defs>
              <Linear id={`bd-about-${ribbon.name}-crease`} from={ribbon.along[0]} to={ribbon.along[1]} stops={CREASE} />
            </defs>
            {ribbon.creases.map((crease) => (
              <path key={crease.slice(0, 24)} d={crease} stroke={`url(#bd-about-${ribbon.name}-crease)`} strokeWidth={2} strokeLinecap="round" />
            ))}
          </Piece>
        ),
      ])}
    </Scene>
  );
}
