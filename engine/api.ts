/**
 * The engine's HTTP face: the few routes the studio calls on Gala's server.
 *
 *   POST /api/turn    Gala takes a turn on a project.
 *   POST /api/stop    Stop the turn in progress.
 *   POST /api/memory  File a line the person added to memory.
 *   GET  /api/fonts   Google's type classes and moods, for the type tray.
 *
 * The person's sign-in token arrives in the Authorization header and is
 * passed straight to storage, which is what checks it. This server never
 * decides who someone is, never stores the token, and never logs it.
 *
 * The browser receives states ("working", "done") from these routes and
 * nothing else. Everything Gala says reaches the browser through storage,
 * after the checks in guard.ts.
 */
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";
import { classLabel, fontData } from "./fonts.ts";
import { runTurn, type TurnResult } from "./loop.ts";
import { headingFor } from "./memory.ts";
import { assertComplete, loadPrompt, type Prompt } from "./prompt.ts";
import { isStage } from "./steps.ts";
import { ConvexStore, fileMemoryLine, ownsProject, StorageError } from "./store-convex.ts";

/** Turns in progress, by project. One per project; storage's lock says the same. */
const running = new Map<string, { controller: AbortController; finished: Promise<TurnResult | "signin"> }>();

/** More turns than this at once and new ones are asked to wait: each one draws and checks several images. */
const MAX_TURNS_AT_ONCE = 12;

let prompt: Prompt | null = null;

/** Loads the prompt into memory. Called once when the server starts. */
export async function startEngine(): Promise<string> {
  prompt = await loadPrompt();
  assertComplete(prompt);
  return prompt.source;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > 16 * 1024) return null;
    chunks.push(chunk as Buffer);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof value === "object" && value !== null ? value : null;
  } catch {
    return null;
  }
}

/** The bearer token, if the header has the shape of one. */
function tokenOf(request: IncomingMessage): string | null {
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.authorization ?? "");
  return match === null ? null : match[1]!;
}

/**
 * When a token was issued and when it runs out, for the log. Only these two
 * times are read from it; the token itself is never logged. Storage is what
 * verifies the token: this is for telling, afterwards, how old it was.
 */
function tokenTimes(token: string): string {
  try {
    const claims = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as { iat?: number; exp?: number };
    const time = (seconds: number | undefined) => (typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : "unknown");
    return `issued ${time(claims.iat)}, expires ${time(claims.exp)}`;
  } catch {
    return "times unreadable";
  }
}

/** A storage id: letters and digits only, so it is safe to put in a URL or a map key. */
function idOf(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9]{8,64}$/i.test(value) ? value : null;
}

async function turn(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const token = tokenOf(request);
  const body = await readJson(request);
  const projectId = idOf(body?.projectId);
  // "Back to this step" in the Work panel names the step; anything else is refused.
  const back = body?.back === undefined ? undefined : isStage(body.back) ? body.back : null;
  // Try again on a notice: the turn replays what it failed on, or says nothing was owed.
  const retry = body?.retry === true;
  if (token === null || projectId === null || back === null) return json(response, 400, { state: "refused" });
  if (prompt === null) return json(response, 503, { state: "unavailable" });

  let entry = running.get(projectId);
  if (entry === undefined) {
    if (running.size >= MAX_TURNS_AT_ONCE) return json(response, 429, { state: "busy" });
    const controller = new AbortController();
    // The turn's id: random, and from here on the proof that this turn was opened by the project's owner.
    const store = new ConvexStore({ projectId, turnId: randomUUID(), token });
    console.log(`Turn asked for; sign-in token ${tokenTimes(token)}.`);
    const finished = runTurn(store, prompt, controller.signal, { back, retry })
      .catch((error): TurnResult | "signin" => {
        // Storage refused to open the turn. A refused sign-in is told apart, so the page can sign in afresh and ask again.
        console.warn(`Turn not opened: ${error instanceof Error ? error.message : "unknown error"}`);
        return error instanceof StorageError && error.status === 401 ? "signin" : "trouble";
      })
      .finally(() => running.delete(projectId));
    entry = { controller, finished };
    running.set(projectId, entry);
  }

  // The answer stays open while Gala works, with a line every few seconds
  // so nothing in between closes it. If it closes anyway, the turn goes on.
  response.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.write(`${JSON.stringify({ state: "working" })}\n`);
  const beat = setInterval(() => response.write(`${JSON.stringify({ state: "working" })}\n`), 8_000);
  const result = await entry.finished;
  clearInterval(beat);
  response.end(`${JSON.stringify({ state: result })}\n`);
}

async function stop(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const token = tokenOf(request);
  const projectId = idOf((await readJson(request))?.projectId);
  if (token === null || projectId === null) return json(response, 400, { state: "refused" });
  const entry = running.get(projectId);
  if (entry === undefined) return json(response, 200, { state: "idle" });
  // Storage decides whether this person owns the project; only then is the turn stopped.
  if (!(await ownsProject(projectId, token).catch(() => false))) return json(response, 403, { state: "refused" });
  entry.controller.abort();
  json(response, 200, { state: "stopped" });
}

async function memory(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const token = tokenOf(request);
  const body = await readJson(request);
  const memoryId = idOf(body?.memoryId);
  const text = typeof body?.text === "string" ? body.text.slice(0, 500) : null;
  if (token === null || memoryId === null || text === null) return json(response, 400, { state: "refused" });
  try {
    const group = await headingFor(text);
    await fileMemoryLine(memoryId, group, token);
    json(response, 200, { state: "done" });
  } catch {
    json(response, 502, { state: "trouble" });
  }
}

let fontsBody: Buffer | null = null;

/** Google's classes, moods and families, as the type tray needs them. Public data. */
async function fonts(response: ServerResponse): Promise<void> {
  if (fontsBody === null) {
    const data = await fontData();
    fontsBody = gzipSync(
      JSON.stringify({
        categories: data.classes.map(classLabel),
        moods: data.moods,
        families: data.families
          .filter((family) => Object.keys(family.classes).length > 0)
          .map((family) => ({ family: family.family, classes: Object.fromEntries(Object.entries(family.classes).map(([name, score]) => [classLabel(name), score])), moods: family.moods, quality: Math.round(family.quality) })),
      }),
    );
  }
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Encoding": "gzip", "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" });
  response.end(fontsBody);
}

/** Answers an /api request. Returns false when the path is not one of the engine's. */
export async function handleApi(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
  try {
    if (pathname === "/api/turn" && request.method === "POST") await turn(request, response);
    else if (pathname === "/api/stop" && request.method === "POST") await stop(request, response);
    else if (pathname === "/api/memory" && request.method === "POST") await memory(request, response);
    else if (pathname === "/api/fonts" && request.method === "GET") await fonts(response);
    else return false;
  } catch {
    if (!response.headersSent) json(response, 500, { state: "trouble" });
    else response.end();
  }
  return true;
}
