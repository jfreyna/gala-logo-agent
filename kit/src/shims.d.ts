// Type declarations for the dependency that ships none, limited to what
// the kit calls.

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
