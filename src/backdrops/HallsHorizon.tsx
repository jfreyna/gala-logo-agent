import type { CSSProperties } from "react";
import { useTheme, type Mode } from "../lib/theme";
import { HALLS_BAND, HALLS_CREASE_LEFT, HALLS_CREASE_RIGHT, HALLS_FOLD } from "./paths";
import { Linear, ofHeight, Piece, Radial, Scene, STAGE_WIDTH, Sweep, whole, type Box, type Stop } from "./Scene";

const HEIGHT = 523;

/** The horizon: where the sky ends and the ground begins, in frame pixels from the top of the halls. */
const HORIZON = 278.411;

type Blend = "normal" | "multiply" | "screen";

/** Colors and blend modes from "halls / Frame 2" in the light and dark frames (5595:14205, 5595:14245). */
const PALETTE: Record<
  Mode,
  {
    page: string;
    sky: Stop[];
    ground: Stop[];
    horizonGlow: Stop[];
    horizonGlowBlend: Blend;
    band: Stop[];
    bandBlend: Blend;
    purpleMiddle: string;
  }
> = {
  light: {
    page: "#f6fafc",
    sky: [[0, "#ECE0FF", 0], [0.4, "#ECE0FF", 0], [1, "#ECE0FF", 0.75]],
    ground: [[0, "#FED980", 0.75], [1, "#F4F7E3", 0]],
    horizonGlow: [[0, "#FCB879", 0.6], [0.6, "#FCB879", 0.27], [1, "#FCB879", 0]],
    horizonGlowBlend: "multiply",
    band: [[0, "#8A4DED", 0], [0.2, "#7F55C3", 0.95], [0.5, "#B79CE3"], [0.75, "#D1EF1D"], [1, "#E7FF57", 0]],
    bandBlend: "multiply",
    purpleMiddle: "#B79CE3",
  },
  dark: {
    page: "#021c29",
    sky: [[0, "#451D87", 0], [0.4, "#451D87", 0], [1, "#451D87", 0.3]],
    ground: [[0, "#1D576F", 0.75], [1, "#021C29", 0]],
    horizonGlow: [[0, "#8A4DED", 0.2925], [0.6, "#8A4DED", 0.131625], [1, "#8A4DED", 0]],
    horizonGlowBlend: "screen",
    band: [[0, "#B79CE3", 0], [0.2, "#8A4DED", 0.95], [0.5, "#D4C1F0"], [0.75, "#D1EF1D"], [1, "#D1EF1D", 0]],
    bandBlend: "normal",
    purpleMiddle: "#A57FDD",
  },
};

/** Both ends of the ribbon's own gradient: the line the band runs along. */
const BAND_FROM: [number, number] = [-80, 99.4436];
const BAND_TO: [number, number] = [1520, 79.3283];

const WHOLE: Box = { x: 0, y: 0, width: STAGE_WIDTH, height: HEIGHT };
const RIBBON: Box = { x: -98, y: -5, width: 1638, height: 228 };

/** The white line along a fold: clear at both ends, half white between. */
const CREASE: Stop[] = [[0, "white", 0], [0.2, "white", 0.5], [0.8, "white", 0.5], [1, "white", 0]];

type Ball = {
  name: string;
  center: [number, number];
  radii: [number, number];
  /** The sphere's own gradient: where its highlight sits, and how far the gradient reaches. */
  light: { center: [number, number]; radii: [number, number]; stops: (palette: (typeof PALETTE)[Mode]) => Stop[] };
  shadow: { center: [number, number]; radii: [number, number]; strength: number };
  /** Frame pixels it bobs, how long one bob takes, and how long after the entrance it starts. */
  rise: number;
  period: number;
  wait: number;
  /** Frame pixels it shifts away from the pointer, and how far it lags the page as it scrolls. */
  depth: number;
  rate: number;
};

const BALLS: Ball[] = [
  {
    name: "lime",
    center: [1130, 178.985],
    radii: [96, 95.4496],
    light: { center: [1094, 139.214], radii: [144, 143.174], stops: () => [[0, "#EBF6A6"], [0.42, "#D1EF1D"], [1, "#819600"]] },
    shadow: { center: [1437, 288.354], radii: [442, 47.7247], strength: 0.55 },
    rise: 12,
    period: 9,
    wait: 0,
    depth: 8,
    rate: 0.12,
  },
  {
    name: "purple",
    center: [300, 159.099],
    radii: [64, 63.6327],
    light: { center: [276, 132.254], radii: [96, 95.4493], stops: (palette) => [[0, "#ECE0FF"], [0.42, palette.purpleMiddle], [1, "#451D87"]] },
    shadow: { center: [505, 290.342], radii: [294, 31.8164], strength: 0.5 },
    rise: 10,
    period: 7,
    wait: 0.9,
    depth: 6,
    rate: 0.08,
  },
  {
    name: "blue",
    center: [980, 244.606],
    radii: [26, 25.851],
    light: { center: [970, 233.669], radii: [39, 38.7763], stops: () => [[0, "#E7F3F8"], [0.42, "#BDDCEA"], [1, "#3B7187"]] },
    shadow: { center: [1063, 292.331], radii: [120, 12.9254], strength: 0.45 },
    rise: 8,
    period: 6,
    wait: 1.7,
    depth: 4,
    rate: 0.05,
  },
];

/** The blur on every shadow: a standard deviation of 8 frame pixels. Each shadow's layer leaves 24 around it for the blur to fade out in. */
const SHADOW_BLUR = 8;
const SHADOW_ROOM = SHADOW_BLUR * 3;

/** How long the entrance lasts: the spheres settle in 1.2 seconds, and the ribbon's first sweep ends at 3.5 (see backdrops.css). */
const ENTRANCE = 3500;

/** Frame pixels the spheres wait above their place before the entrance, and the ribbon drifts. */
const ABOVE = 20;
const DRIFT = 6;

/** What the ribbon's pieces share: they drift 6 frame pixels together, and shift 2 away from the pointer. */
const RIBBON_DRIFT = { "--bd-drift": ofHeight(DRIFT, RIBBON) } as CSSProperties;
const RIBBON_FOLLOW = { depth: 2 };

/**
 * The halls' backdrop: a horizon, a twisted ribbon over it, and three
 * spheres resting on the ground with long shadows.
 *
 * The sky, the ground and the horizon are scenery and stay still. The
 * ribbon never changes shape: it drifts as one piece, and a highlight
 * travels along it. The spheres settle in when the scene comes on screen,
 * then float, each with its shadow narrowing and fading as it rises.
 */
export function HallsHorizon({ className }: { className: string }) {
  const { mode } = useTheme();
  const palette = PALETTE[mode];
  return (
    <Scene name="halls-horizon" height={HEIGHT} page={palette.page} className={className} entrance={ENTRANCE}>
      {/* Scenery: the sky, the ground, the glow along the horizon, and the horizon line. Drawn once. */}
      <Piece name="scenery" box={WHOLE} stageHeight={HEIGHT}>
        <defs>
          <Linear id="bd-halls-sky" from={[0, -56.6558]} to={[0, HORIZON]} stops={palette.sky} />
          <Linear id="bd-halls-ground" from={[0, HORIZON]} to={[0, 463.344]} stops={palette.ground} />
          <Radial id="bd-halls-horizon-glow" center={[760, HORIZON]} radii={[900, 59.6558]} stops={palette.horizonGlow} />
          <Linear id="bd-halls-line" from={[0, 0]} to={[STAGE_WIDTH, 0]} stops={[[0, "#6C97AA", 0], [0.2, "#6C97AA", 0.7], [0.8, "#6C97AA", 0.7], [1, "#6C97AA", 0]]} />
          <filter id="bd-halls-horizon-blur" x={-220} y={138.755} width={1960} height={279.312} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={40} />
          </filter>
        </defs>
        {/* The page color sits under the glow so it blends with the page, as it does in the frame. */}
        <rect x={0} y={0} width={STAGE_WIDTH} height={HEIGHT} fill={palette.page} />
        <rect x={0} y={-56.6558} width={STAGE_WIDTH} height={HORIZON + 56.6558} fill="url(#bd-halls-sky)" />
        <rect x={0} y={HORIZON} width={STAGE_WIDTH} height={184.933} fill="url(#bd-halls-ground)" />
        <g filter="url(#bd-halls-horizon-blur)" style={{ mixBlendMode: palette.horizonGlowBlend }}>
          <ellipse cx={760} cy={HORIZON} rx={900} ry={59.6558} fill="url(#bd-halls-horizon-glow)" />
        </g>
        <rect x={0} y={277.417} width={STAGE_WIDTH} height={1.988} fill="url(#bd-halls-line)" />
      </Piece>

      {/* The ribbon: the band, its two shades (under the fold, and past the twist), the light, and the two creases. */}
      <Piece name="ribbon-band" box={RIBBON} stageHeight={HEIGHT} blend={palette.bandBlend} follow={RIBBON_FOLLOW} className="bd-ribbon" style={RIBBON_DRIFT}>
        <defs>
          <Linear id="bd-halls-band" from={BAND_FROM} to={BAND_TO} stops={palette.band} />
        </defs>
        <path d={HALLS_BAND} fill="url(#bd-halls-band)" />
      </Piece>
      <Piece name="ribbon-shades" box={RIBBON} stageHeight={HEIGHT} blend="multiply" follow={RIBBON_FOLLOW} className="bd-ribbon" style={RIBBON_DRIFT}>
        <defs>
          <Linear id="bd-halls-shade" from={[584, 201.853]} to={[615.647, 36.7373]} stops={[[0, "#3D1878", 0], [0.55, "#3D1878", 0], [1, "#3D1878", 0.4]]} />
          <Linear id="bd-halls-fold" from={BAND_FROM} to={BAND_TO} stops={[[0, "#3D1878", 0], [0.5, "#3D1878", 0], [0.58, "#3D1878", 0.16], [1, "#3D1878", 0.1]]} />
        </defs>
        {/* Two shades that both multiply: one layer that multiplies gives the same result as two. */}
        <path d={HALLS_BAND} fill="url(#bd-halls-shade)" />
        <path d={HALLS_FOLD} fill="url(#bd-halls-fold)" style={{ mixBlendMode: "multiply" }} />
      </Piece>
      <Sweep name="ribbon-light" box={RIBBON} outline={HALLS_BAND} along={[BAND_FROM, BAND_TO]} stageHeight={HEIGHT} follow={RIBBON_FOLLOW} className="bd-sweep-loop bd-ribbon" style={RIBBON_DRIFT} />
      <Piece name="ribbon-creases" box={RIBBON} stageHeight={HEIGHT} follow={RIBBON_FOLLOW} className="bd-ribbon" style={RIBBON_DRIFT}>
        <defs>
          <Linear id="bd-halls-crease" from={BAND_FROM} to={BAND_TO} stops={CREASE} />
        </defs>
        <path d={HALLS_CREASE_LEFT} stroke="url(#bd-halls-crease)" strokeWidth={2} strokeLinecap="round" />
        <path d={HALLS_CREASE_RIGHT} stroke="url(#bd-halls-crease)" strokeWidth={2} strokeLinecap="round" />
      </Piece>

      {/* The spheres, each over its shadow. */}
      {BALLS.map((ball) => {
        const shadowBox = whole({
          x: ball.shadow.center[0] - ball.shadow.radii[0] - SHADOW_ROOM,
          y: ball.shadow.center[1] - ball.shadow.radii[1] - SHADOW_ROOM,
          width: (ball.shadow.radii[0] + SHADOW_ROOM) * 2,
          height: (ball.shadow.radii[1] + SHADOW_ROOM) * 2,
        });
        const sphereBox = whole({ x: ball.center[0] - ball.radii[0] - 1, y: ball.center[1] - ball.radii[1] - 1, width: ball.radii[0] * 2 + 2, height: ball.radii[1] * 2 + 2 });
        const moves = {
          "--bd-above": ofHeight(ABOVE, sphereBox),
          "--bd-rise": ofHeight(ball.rise, sphereBox),
          "--bd-period": `${ball.period}s`,
          "--bd-wait": `${ball.wait}s`,
        } as CSSProperties;
        const follow = { depth: ball.depth, rate: ball.rate };
        return [
          <Piece key={`${ball.name}-shadow`} name={`shadow-${ball.name}`} box={shadowBox} stageHeight={HEIGHT} blend="multiply" follow={follow} className="bd-shadow" style={moves}>
            <defs>
              <Radial id={`bd-halls-${ball.name}-shadow`} center={ball.shadow.center} radii={ball.shadow.radii} stops={[[0, "#1D576F", ball.shadow.strength], [1, "#1D576F", 0]]} />
              <filter id={`bd-halls-${ball.name}-blur`} x={shadowBox.x} y={shadowBox.y} width={shadowBox.width} height={shadowBox.height} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                <feGaussianBlur stdDeviation={SHADOW_BLUR} />
              </filter>
            </defs>
            <g filter={`url(#bd-halls-${ball.name}-blur)`}>
              <ellipse cx={ball.shadow.center[0]} cy={ball.shadow.center[1]} rx={ball.shadow.radii[0]} ry={ball.shadow.radii[1]} fill={`url(#bd-halls-${ball.name}-shadow)`} />
            </g>
          </Piece>,
          <Piece key={ball.name} name={`sphere-${ball.name}`} box={sphereBox} stageHeight={HEIGHT} follow={follow} className="bd-sphere" style={moves}>
            <defs>
              <Radial id={`bd-halls-${ball.name}`} center={ball.light.center} radii={ball.light.radii} stops={ball.light.stops(palette)} />
            </defs>
            <ellipse cx={ball.center[0]} cy={ball.center[1]} rx={ball.radii[0]} ry={ball.radii[1]} fill={`url(#bd-halls-${ball.name})`} />
          </Piece>,
        ];
      })}
    </Scene>
  );
}
