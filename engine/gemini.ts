/**
 * The Gemini connector: text that fills in a JSON shape, grounded research,
 * and drawing. One place for the wire format, retries and timeouts.
 */
import { config } from "./config.ts";

/** A JSON shape in Gemini's schema dialect. */
export type Shape =
  | { type: "STRING"; nullable?: boolean; enum?: string[]; description?: string }
  | { type: "BOOLEAN"; description?: string }
  | { type: "NUMBER"; description?: string }
  | { type: "ARRAY"; items: Shape; description?: string; minItems?: number; maxItems?: number }
  | { type: "OBJECT"; properties: Record<string, Shape>; required?: string[]; description?: string };

export type Image = { bytes: Uint8Array; mime: string };

/** One side of the conversation, as the model reads it. */
export type Spoken = { role: "user" | "model"; text: string; images?: Image[] };

export class ModelError extends Error {}

const ATTEMPTS = 3;
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

async function post(model: string, body: unknown, signal: AbortSignal | undefined, timeoutMs: number): Promise<any> {
  let lastError = "no attempt made";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const response = await fetch(`${config.geminiUrl}/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (response.ok) return await response.json();
      lastError = `HTTP ${response.status}`;
      if (!RETRY_STATUSES.has(response.status)) break;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error instanceof Error ? error.name : "network error";
    }
    await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
  }
  throw new ModelError(`${model} did not answer (${lastError})`);
}

function parts(spoken: Spoken): unknown[] {
  const images = (spoken.images ?? []).map((image) => ({ inlineData: { mimeType: image.mime, data: Buffer.from(image.bytes).toString("base64") } }));
  return [...images, { text: spoken.text }];
}

/**
 * Asks the text model to fill in `shape`. The instructions go in as the
 * system instruction and never appear in what comes back to the caller's
 * visitor: the caller decides which fields of the answer are shown.
 */
export async function fill<T>(options: {
  instructions: string;
  conversation: Spoken[];
  shape: Shape;
  /** Let the model search the web first (the research step). */
  search?: boolean;
  signal?: AbortSignal;
}): Promise<T> {
  const body = {
    systemInstruction: { parts: [{ text: options.instructions }] },
    contents: options.conversation.map((spoken) => ({ role: spoken.role, parts: parts(spoken) })),
    ...(options.search ? { tools: [{ googleSearch: {} }] } : {}),
    generationConfig: {
      thinkingConfig: { thinkingLevel: "low" },
      responseMimeType: "application/json",
      responseSchema: options.shape,
    },
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const data = await post(config.textModel, body, options.signal, options.search ? 120_000 : 60_000);
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((part: { text?: string }) => part.text ?? "").join("");
    try {
      return JSON.parse(text) as T;
    } catch {
      // A cut-off or malformed answer: ask once more.
    }
  }
  throw new ModelError(`${config.textModel} did not return the shape asked for`);
}

/**
 * Draws one image. `from` is an existing mark to redraw (a variation).
 * `step` picks the model: 0 is the cheapest.
 */
export async function draw(options: { prompt: string; from?: Image; step?: number; signal?: AbortSignal }): Promise<Image & { model: string }> {
  const model = config.imageModels[Math.min(options.step ?? 0, config.imageModels.length - 1)]!;
  const body = {
    contents: [{ role: "user", parts: parts({ role: "user", text: options.prompt, images: options.from ? [options.from] : [] }) }],
    generationConfig: { responseModalities: ["IMAGE"] },
  };
  const data = await post(model, body, options.signal, 120_000);
  const image = (data.candidates?.[0]?.content?.parts ?? []).find((part: { inlineData?: unknown }) => part.inlineData !== undefined);
  if (image === undefined) throw new ModelError(`${model} returned no image`);
  return { bytes: new Uint8Array(Buffer.from(image.inlineData.data, "base64")), mime: image.inlineData.mimeType, model };
}
