/**
 * A small SVG path model: parse path data into absolute moveto, lineto,
 * cubic curveto and closepath; transform it; measure its exact bounds; and
 * write it back as SVG path data or PostScript.
 *
 * Every shape in the kit passes through here, so the SVG, EPS and PNG files
 * are drawn from the same geometry.
 *
 * Reach (gate 3b): handles M L H V C Q Z in absolute and relative forms,
 * which is all Potrace and opentype.js emit. Arcs (A) and the smooth forms
 * (S, T) throw rather than guess; marks arriving as SVG are rasterized and
 * traced, so they never reach this parser.
 */

export type Point = { x: number; y: number };
export type Segment =
  | { op: "M"; p: Point }
  | { op: "L"; p: Point }
  | { op: "C"; c1: Point; c2: Point; p: Point }
  | { op: "Z" };

export type Box = { x: number; y: number; width: number; height: number };

const TOKEN = /[MmLlHhVvCcQqZzAaSsTt]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

export function parsePath(d: string): Segment[] {
  const tokens = d.match(TOKEN) ?? [];
  const out: Segment[] = [];
  let i = 0;
  let cmd = "";
  let cur: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  const num = (): number => {
    const t = tokens[i++];
    if (t === undefined || /[a-z]/i.test(t)) throw new Error(`kit: malformed path data near token ${i}`);
    return Number(t);
  };
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (/[a-z]/i.test(t)) {
      cmd = t;
      i++;
    } else if (cmd === "" || cmd === "Z" || cmd === "z") {
      throw new Error("kit: path data has numbers without a command");
    }
    const rel = cmd === cmd.toLowerCase();
    const at = (x: number, y: number): Point => (rel ? { x: cur.x + x, y: cur.y + y } : { x, y });
    switch (cmd.toUpperCase()) {
      case "M": {
        cur = at(num(), num());
        start = cur;
        out.push({ op: "M", p: cur });
        cmd = rel ? "l" : "L"; // further pairs are implicit linetos
        break;
      }
      case "L":
        cur = at(num(), num());
        out.push({ op: "L", p: cur });
        break;
      case "H": {
        const x = num();
        cur = { x: rel ? cur.x + x : x, y: cur.y };
        out.push({ op: "L", p: cur });
        break;
      }
      case "V": {
        const y = num();
        cur = { x: cur.x, y: rel ? cur.y + y : y };
        out.push({ op: "L", p: cur });
        break;
      }
      case "C": {
        const c1 = at(num(), num());
        const c2 = at(num(), num());
        const p = at(num(), num());
        out.push({ op: "C", c1, c2, p });
        cur = p;
        break;
      }
      case "Q": {
        // Raise the quadratic to a cubic: PostScript has only curveto.
        const q = at(num(), num());
        const p = at(num(), num());
        const c1 = { x: cur.x + (2 / 3) * (q.x - cur.x), y: cur.y + (2 / 3) * (q.y - cur.y) };
        const c2 = { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) };
        out.push({ op: "C", c1, c2, p });
        cur = p;
        break;
      }
      case "Z":
        out.push({ op: "Z" });
        cur = start;
        break;
      default:
        throw new Error(`kit: path command "${cmd}" is not supported`);
    }
  }
  return out;
}

export function subpathCount(segments: Segment[]): number {
  return segments.filter((s) => s.op === "M").length;
}

/** Applies x' = x * scale + dx, y' = y * scale + dy. */
export function transform(segments: Segment[], scale: number, dx: number, dy: number): Segment[] {
  const t = (p: Point): Point => ({ x: p.x * scale + dx, y: p.y * scale + dy });
  return segments.map((s) => {
    switch (s.op) {
      case "M":
      case "L":
        return { op: s.op, p: t(s.p) };
      case "C":
        return { op: "C", c1: t(s.c1), c2: t(s.c2), p: t(s.p) };
      default:
        return s;
    }
  });
}

/** Parameter values in (0,1) where a cubic's coordinate has an extremum. */
function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const roots: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      roots.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    }
  }
  return roots.filter((t) => t > 0 && t < 1);
}

const bez = (t: number, p0: number, p1: number, p2: number, p3: number): number => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

/** Exact ink bounds (curve extrema, not control points). Throws on an empty path. */
export function bounds(segments: Segment[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  let cur: Point = { x: 0, y: 0 };
  for (const s of segments) {
    if (s.op === "M" || s.op === "L") {
      add(s.p.x, s.p.y);
      cur = s.p;
    } else if (s.op === "C") {
      add(s.p.x, s.p.y);
      for (const t of cubicExtrema(cur.x, s.c1.x, s.c2.x, s.p.x)) add(bez(t, cur.x, s.c1.x, s.c2.x, s.p.x), bez(t, cur.y, s.c1.y, s.c2.y, s.p.y));
      for (const t of cubicExtrema(cur.y, s.c1.y, s.c2.y, s.p.y)) add(bez(t, cur.x, s.c1.x, s.c2.x, s.p.x), bez(t, cur.y, s.c1.y, s.c2.y, s.p.y));
      cur = s.p;
    }
  }
  if (!Number.isFinite(minX)) throw new Error("kit: cannot measure an empty path");
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function unionBoxes(boxes: Box[]): Box {
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const fmt = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};

export function toSvgPathData(segments: Segment[]): string {
  return segments
    .map((s) => {
      switch (s.op) {
        case "M":
        case "L":
          return `${s.op}${fmt(s.p.x)} ${fmt(s.p.y)}`;
        case "C":
          return `C${fmt(s.c1.x)} ${fmt(s.c1.y)} ${fmt(s.c2.x)} ${fmt(s.c2.y)} ${fmt(s.p.x)} ${fmt(s.p.y)}`;
        default:
          return "Z";
      }
    })
    .join("");
}

/**
 * PostScript path operators for the segments. `flipHeight` turns SVG's
 * y-down space into PostScript's y-up space (y' = flipHeight - y).
 */
export function toPostScript(segments: Segment[], flipHeight: number): string {
  const p = (pt: Point) => `${fmt(pt.x)} ${fmt(flipHeight - pt.y)}`;
  const lines: string[] = [];
  for (const s of segments) {
    if (s.op === "M") lines.push(`${p(s.p)} m`);
    else if (s.op === "L") lines.push(`${p(s.p)} l`);
    else if (s.op === "C") lines.push(`${p(s.c1)} ${p(s.c2)} ${p(s.p)} c`);
    else lines.push("h");
  }
  return lines.join("\n");
}
