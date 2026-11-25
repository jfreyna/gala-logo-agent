import { useReducedMotion } from "../lib/motion";
import { useTheme } from "../lib/theme";

export type BackdropName = "hero-silk" | "halls-horizon" | "about-ribbons";

/**
 * Backdrops that have an animated file beside the static one. An animated
 * backdrop is /backdrops/<name>-<mode>.animated.svg, the same size and crop
 * as the static file, so adding a name here changes nothing else.
 */
const ANIMATED: ReadonlySet<BackdropName> = new Set<BackdropName>([]);

/**
 * One backdrop: a decorative layer behind the content, loaded from one file
 * per backdrop and mode. The static file shows when no animated one exists
 * yet, and whenever the visitor's system asks for reduced motion.
 */
export function Backdrop({ name, className }: { name: BackdropName; className: string }) {
  const { mode } = useTheme();
  const reduced = useReducedMotion();
  const animated = ANIMATED.has(name) && !reduced;
  return (
    <img
      alt=""
      aria-hidden="true"
      src={`/backdrops/${name}-${mode}${animated ? ".animated" : ""}.svg`}
      className={`pointer-events-none absolute max-w-none select-none ${className}`}
      data-name={`backdrop/${name}`}
    />
  );
}
