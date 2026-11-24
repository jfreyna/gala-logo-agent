// Type declarations for the two dependencies that ship none, limited to what
// the kit calls.

declare module "opentype.js" {
  namespace opentype {
    interface BoundingBox {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
    interface Path {
      commands: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[];
      toPathData(decimalPlaces?: number): string;
      getBoundingBox(): BoundingBox;
    }
    interface Glyph {
      getBoundingBox(): BoundingBox;
    }
    interface Font {
      unitsPerEm: number;
      tables: Record<string, unknown>;
      charToGlyphIndex(ch: string): number;
      charToGlyph(ch: string): Glyph;
      getPath(text: string, x: number, y: number, fontSize: number, options?: { kerning?: boolean }): Path;
    }
  }
  const opentype: { parse(buffer: ArrayBuffer): opentype.Font };
  export default opentype;
}

declare module "potrace" {
  type TraceOptions = {
    threshold?: number;
    blackOnWhite?: boolean;
    turdSize?: number;
    optCurve?: boolean;
    optTolerance?: number;
    alphaMax?: number;
    color?: string;
    background?: string;
  };
  const potrace: {
    trace(input: Buffer, options: TraceOptions, callback: (err: Error | null, svg: string) => void): void;
  };
  export default potrace;
}
