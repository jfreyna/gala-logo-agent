import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useReducedMotion } from "../lib/motion";
import type { Falloff } from "./falloffs";
import "./backdrops.css";

/**
 * A backdrop is a small scene: a stage the size of its frame (1440 wide),
 * with each piece laid on it as its own layer. The stage scales as one
 * piece, so a phone shows the same composition smaller.
 *
 * With motion off (the visitor's system asks for reduced motion) the stage
 * is the frame's composition and nothing else: no loops, no entrance, no
 * parallax. With motion on, the pieces move by transform and opacity only,
 * the loops pause while the scene is off the screen, and a pointer moves
 * things only on a device that has one.
 */

/** Frame pixels across every stage. Each piece is placed in these units. */
export const STAGE_WIDTH = 1440;

export type Box = { x: number; y: number; width: number; height: number };

/** The smallest box on whole frame pixels that holds the given one, so a layer's edges land on pixels at the frame's size. */
export function whole(box: Box): Box {
  const [x, y] = [Math.floor(box.x), Math.floor(box.y)];
  return { x, y, width: Math.ceil(box.x + box.width) - x, height: Math.ceil(box.y + box.height) - y };
}

/** A distance in frame pixels as a percentage of a box's height: the unit the keyframes move a piece by. */
export function ofHeight(pixels: number, box: Box): string {
  return `${Math.round((pixels / box.height) * 100000) / 1000}%`;
}

/** A box in frame pixels, as the share of the stage it takes. */
export function place(box: Box, stageHeight: number): CSSProperties {
  return {
    left: `${(box.x / STAGE_WIDTH) * 100}%`,
    top: `${(box.y / stageHeight) * 100}%`,
    width: `${(box.width / STAGE_WIDTH) * 100}%`,
    height: `${(box.height / stageHeight) * 100}%`,
  };
}

/**
 * How a piece answers the pointer and the scroll. `depth` is how many frame
 * pixels it shifts away from a pointer at the edge of the screen. `rate` is
 * how far it lags the page: that share of the distance between the scene and
 * the middle of the screen.
 */
export type Follow = { depth: number; rate?: number };

type Blend = "normal" | "multiply" | "screen";

/** The scene is never treated as further than this from the middle of the screen, in pixels. */
const FARTHEST = 600;

export function Scene({
  name,
  height,
  page,
  className,
  entrance = 0,
  children,
}: {
  /** Names the backdrop for the checks: backdrop/<name>. */
  name: string;
  /** The stage's height in frame pixels. */
  height: number;
  /** The page color behind the scene. The pieces that blend, blend with it. */
  page: string;
  /** Where the scene sits on the page, and how much of it shows. */
  className: string;
  /**
   * How long the scene's entrance lasts, in milliseconds, if it has one. The
   * scene holds its opening pose until a fifth of it is on screen, plays the
   * entrance, and then starts its idle loops.
   */
  entrance?: number;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [phase, setPhase] = useState<"waiting" | "entering" | "idle">(entrance > 0 ? "waiting" : "idle");
  const moving = !reduced;

  // On screen or not, and the start of the one-time entrance.
  useEffect(() => {
    const element = box.current;
    if (!moving || element === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.intersectionRatio >= 0.2) setPhase((now) => (now === "waiting" ? "entering" : now));
      },
      { threshold: [0, 0.2] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [moving]);

  // The entrance plays once, then the idle loops take over.
  useEffect(() => {
    if (phase !== "entering") return;
    const timer = setTimeout(() => setPhase("idle"), entrance);
    return () => clearTimeout(timer);
  }, [phase, entrance]);

  /*
   * Pointer and scroll, while the scene is on screen. Each piece that
   * follows sits in a wrapper, and this sets that wrapper's `translate`:
   * away from the pointer by up to its depth, and lagging the page by its
   * rate. Nothing else on the page is touched, so a frame costs one small
   * style change per wrapper and no layout or paint.
   */
  useEffect(() => {
    const [element, floor] = [box.current, stage.current];
    if (!moving || !inView || element === null || floor === null) return;
    const followers = [...floor.querySelectorAll<HTMLElement>("[data-depth]")].map((piece) => ({ piece, depth: Number(piece.dataset.depth), rate: Number(piece.dataset.rate ?? 0) }));
    if (followers.length === 0) return;

    const pointer = { x: 0, y: 0 };
    const goal = { x: 0, y: 0 };
    let distance = 0;
    let frame = 0;

    const draw = () => {
      // One frame pixel on screen: the stage is 1440 of them wide.
      const unit = floor.clientWidth / STAGE_WIDTH;
      for (const { piece, depth, rate } of followers) {
        const x = -pointer.x * depth * unit;
        const y = (-pointer.y * depth - distance * rate) * unit;
        piece.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
      }
    };
    const step = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      distance = Math.max(-FARTHEST, Math.min(FARTHEST, rect.top + rect.height / 2 - window.innerHeight / 2));
      // Ease toward the pointer a little each frame, and stop asking for frames once there.
      pointer.x += (goal.x - pointer.x) * 0.12;
      pointer.y += (goal.y - pointer.y) * 0.12;
      const there = Math.abs(goal.x - pointer.x) < 0.002 && Math.abs(goal.y - pointer.y) < 0.002;
      if (there) Object.assign(pointer, goal);
      draw();
      if (!there) frame = requestAnimationFrame(step);
    };
    const ask = () => {
      if (frame === 0) frame = requestAnimationFrame(step);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      goal.x = (event.clientX / window.innerWidth) * 2 - 1;
      goal.y = (event.clientY / window.innerHeight) * 2 - 1;
      ask();
    };

    step();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    // A finger never moves the scene: the pointer counts only where there is a fine one that can hover.
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (fine) window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("scroll", ask);
      window.removeEventListener("resize", ask);
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
      for (const { piece } of followers) piece.style.translate = "";
    };
  }, [moving, inView]);

  return (
    <div
      ref={box}
      aria-hidden="true"
      className={`bd pointer-events-none absolute select-none overflow-hidden ${className}`}
      data-name={`backdrop/${name}`}
      data-motion={moving ? "on" : "off"}
      data-inview={inView ? "true" : "false"}
      data-phase={phase}
    >
      <div ref={stage} className="bd-stage" style={{ aspectRatio: `${STAGE_WIDTH} / ${height}`, backgroundColor: page }}>
        {children}
      </div>
    </div>
  );
}

/**
 * A glow: one radial gradient on its own layer, with the blur already in its
 * falloff (see scripts/fit-falloffs.mjs). It breathes; `phase` says how far
 * into its ten-second loop it is when the page paints.
 */
export function Glow({
  falloff,
  at,
  color,
  strength,
  blend = "normal",
  phase,
  stageHeight,
}: {
  falloff: Falloff;
  at: [number, number];
  /** "r g b", 0 to 255. */
  color: string;
  /** Opacity at the center before the blur, as the frame sets it. */
  strength: number;
  blend?: "normal" | "screen";
  /** Seconds into the loop at first paint. */
  phase: number;
  stageHeight: number;
}) {
  const stops = falloff.stops.map((share, index) => `rgb(${color} / ${Math.round(share * strength * 10000) / 10000}) ${Math.round((index / (falloff.stops.length - 1)) * 10000) / 100}%`);
  return (
    <div
      className="bd-piece bd-glow"
      style={{
        ...place({ x: at[0] - falloff.rx, y: at[1] - falloff.ry, width: falloff.rx * 2, height: falloff.ry * 2 }, stageHeight),
        backgroundImage: `radial-gradient(closest-side, ${stops.join(", ")})`,
        mixBlendMode: blend,
        animationDelay: `${-phase}s`,
      }}
    />
  );
}

export type Stop = [offset: number, color: string, opacity?: number];

/** A straight gradient between two points, in frame pixels. */
export function Linear({ id, from, to, stops }: { id: string; from: [number, number]; to: [number, number]; stops: Stop[] }) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]}>
      {stops.map(([offset, color, opacity = 1]) => (
        <stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />
      ))}
    </linearGradient>
  );
}

/** A round gradient: a center and two radii, in frame pixels. */
export function Radial({ id, center, radii, stops }: { id: string; center: [number, number]; radii: [number, number]; stops: Stop[] }) {
  return (
    <radialGradient id={id} gradientUnits="userSpaceOnUse" cx={0} cy={0} r={1} gradientTransform={`translate(${center[0]} ${center[1]}) scale(${radii[0]} ${radii[1]})`}>
      {stops.map(([offset, color, opacity = 1]) => (
        <stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />
      ))}
    </radialGradient>
  );
}

/**
 * Where a layer sits, how it blends, and how it follows the pointer and the
 * scroll. The blend mode is on the outermost element of the layer, so it
 * blends with the scene under it, as the frame's layers do.
 *
 * A piece that follows gets this wrapper: the wrapper carries the offset
 * and the piece inside it carries the animation. A browser can run a
 * transform animation on the compositor only if nothing else on that
 * element moves it.
 */
function Layer({ name, box, stageHeight, blend, follow, children }: { name: string; box: Box; stageHeight: number; blend: Blend; follow: Follow; children: ReactNode }) {
  return (
    <div className="bd-piece bd-follows" data-piece={name} data-depth={follow.depth} data-rate={follow.rate ?? 0} style={{ ...place(box, stageHeight), mixBlendMode: blend }}>
      {children}
    </div>
  );
}

/**
 * One drawn piece on its own layer: a small SVG that shows the part of the
 * frame inside `box`.
 */
export function Piece({
  name,
  box,
  stageHeight,
  blend = "normal",
  follow,
  className = "",
  style,
  children,
}: {
  /** Names the piece for the checks. */
  name: string;
  box: Box;
  stageHeight: number;
  blend?: Blend;
  follow?: Follow;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const drawing = (inside: boolean) => (
    <svg
      className={`${inside ? "bd-fill" : "bd-piece"} ${className}`}
      data-piece={inside ? undefined : name}
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      preserveAspectRatio="none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={inside ? style : { ...place(box, stageHeight), mixBlendMode: blend, ...style }}
    >
      {children}
    </svg>
  );
  if (follow === undefined) return drawing(false);
  return (
    <Layer name={name} box={box} stageHeight={stageHeight} blend={blend} follow={follow}>
      {drawing(true)}
    </Layer>
  );
}

/**
 * The traveling highlight: a soft white band that slides along a ribbon and
 * shows only inside the ribbon's outline. The ribbon itself never changes
 * shape; only this light moves.
 */
export function Sweep({
  name,
  box,
  outline,
  along,
  stageHeight,
  follow,
  className = "",
  style,
}: {
  /** Names the piece for the checks. */
  name: string;
  /** The ribbon's bounds, in frame pixels. */
  box: Box;
  /** The ribbon's outline: the highlight shows only inside it. */
  outline: string;
  /** The two ends of the band's own gradient: the direction the light travels. */
  along: [[number, number], [number, number]];
  stageHeight: number;
  follow?: Follow;
  className?: string;
  style?: CSSProperties;
}) {
  const [dx, dy] = [along[1][0] - along[0][0], along[1][1] - along[0][1]];
  const length = Math.hypot(dx, dy);
  // A quarter of the band's length wide, so an eighth to each side of its middle.
  const half = length / 8;
  // CSS angles turn clockwise from "up"; this one points along the band.
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  // Far enough each way that the light is fully off the ribbon at both ends, tilt included.
  const travel = 50 + ((half + (box.height / 2) * Math.abs(dy / dx)) / box.width) * 100 + 1;
  const mask = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.width} ${box.height}" preserveAspectRatio="none"><path d="${outline}"/></svg>`,
  )}")`;
  const light = (inside: boolean) => (
    <div
      className={`${inside ? "bd-fill" : "bd-piece"} bd-sweep ${className}`}
      data-piece={inside ? undefined : name}
      style={{ ...(inside ? {} : place(box, stageHeight)), maskImage: mask, WebkitMaskImage: mask, ...style }}
    >
      <i style={{ "--bd-angle": `${angle.toFixed(2)}deg`, "--bd-half": half.toFixed(1), "--bd-travel": `${travel.toFixed(1)}%` } as CSSProperties} />
    </div>
  );
  if (follow === undefined) return light(false);
  return (
    <Layer name={name} box={box} stageHeight={stageHeight} blend="normal" follow={follow}>
      {light(true)}
    </Layer>
  );
}
