import { useTheme, type Mode } from "../lib/theme";
import { FALLOFFS } from "./falloffs";
import { Glow, Scene } from "./Scene";

const HEIGHT = 850;

/** Colors and strengths from "Gala / hero / silk / light" and "/ dark" (frames 5595:14205, 5595:14245). */
const PALETTE: Record<Mode, { page: string; lavender: [string, number]; center: [string, number]; lime: [string, number] }> = {
  light: { page: "#f6fafc", lavender: ["236 224 255", 0.9], center: ["254 217 128", 0.55], lime: ["235 246 166", 0.9] },
  // The lime glow carries 80% fill opacity in the dark frame: 0.9 x 0.8.
  dark: { page: "#021c29", lavender: ["59 113 135", 0.9], center: ["127 85 195", 0.55], lime: ["131 152 0", 0.72] },
};

/**
 * The hero's backdrop: three glows, lavender at the bottom left, gold (purple
 * in dark) at the top center, lime at the right. They breathe from the first
 * paint, each on its own phase, and have no entrance.
 */
export function HeroGlows({ className }: { className: string }) {
  const { mode } = useTheme();
  const palette = PALETTE[mode];
  return (
    <Scene name="hero-silk" height={HEIGHT} page={palette.page} className={className}>
      <Glow falloff={FALLOFFS.heroLavender} at={[240, 756.997]} color={palette.lavender[0]} strength={palette.lavender[1]} phase={0} stageHeight={HEIGHT} />
      <Glow falloff={FALLOFFS.heroCenter} at={[798, 195.5]} color={palette.center[0]} strength={palette.center[1]} phase={3.3} stageHeight={HEIGHT} />
      <Glow falloff={FALLOFFS.heroLime} at={[1360, 746.183]} color={palette.lime[0]} strength={palette.lime[1]} phase={6.6} stageHeight={HEIGHT} />
    </Scene>
  );
}
