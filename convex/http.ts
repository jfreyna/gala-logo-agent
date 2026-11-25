import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * The routes Gala's server calls. Nothing here is for browsers.
 *
 * Every route needs the shared secret, in the `x-gala-server` header. Only
 * Gala's server on the Sprite holds it, so it says "this is Gala's server".
 * On top of that:
 *
 *   - `/engine/prompt` needs nothing more: it is fetched once at boot,
 *     before anyone has signed in.
 *   - `/engine/begin` opens a turn, and needs the person's own sign-in
 *     token, in `Authorization`. It says whose project the turn is on, and
 *     only the project's owner can open one. So do `/engine/owns` and
 *     `/engine/memory`, which act for a person outside any turn.
 *   - `/engine/read`, `/engine/write`, `/engine/end` and the file routes
 *     run inside a turn, and need the turn's id: random, made by Gala's
 *     server, registered at `begin`, and held as the project's lock. It
 *     works only on that project and only while the lock lasts.
 *
 * So the secret by itself cannot touch a project: it needs a turn that an
 * owner opened. A signed-in person without the secret cannot write as Gala.
 * And a turn, once open, does not die halfway because a token ran out.
 */

/** Compares in the same time whatever the strings hold. */
function sameSecret(given: string, expected: string): boolean {
  let difference = given.length === expected.length ? 0 : 1;
  for (let index = 0; index < expected.length; index++) {
    difference |= (given.charCodeAt(index) || 0) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

/** A refusal when the caller is not Gala's server, or null when it is. */
function refuseUnlessServer(request: Request): Response | null {
  const expected = process.env.GALA_SERVER_SECRET;
  if (expected === undefined || expected.length < 32) return answer(503, { error: "The shared secret is not set." });
  const given = request.headers.get("x-gala-server") ?? "";
  if (!sameSecret(given, expected)) return answer(401, { error: "Not allowed." });
  return null;
}

/**
 * The signed-in person's account, or null. When a token was sent and
 * refused, the reason goes to the log (Convex's own message; it carries no
 * part of the token), so an expired or unverifiable token can be told
 * apart from a missing one.
 */
async function subjectOf(ctx: ActionCtx, request: Request, path: string): Promise<string | null> {
  const sent = request.headers.has("Authorization");
  try {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null && sent) console.warn(`${path}: a sign-in token was sent and gave no identity (expired, or not one Frilly signed).`);
    return identity === null ? null : identity.subject;
  } catch (error) {
    console.warn(`${path}: the sign-in token was refused: ${error instanceof Error ? error.message : "unknown reason"}`);
    return null;
  }
}

type Body = Record<string, unknown>;

/**
 * What a refused call is told. The functions in convex/engine.ts throw
 * short sentences meant to be read ("This turn is over."); those pass
 * through. Anything else, such as a value of the wrong shape, is logged
 * here and answered plainly, so storage's internals are not described to
 * the caller.
 */
function shortMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const sentence = /(?:Uncaught Error: )?([A-Z][^\n]{0,60}\.)(?:\n|$)/.exec(message);
  if (sentence !== null && !message.includes("ArgumentValidationError")) return sentence[1];
  console.warn(`A call was not accepted: ${message.split("\n")[0]}`);
  return "Not accepted.";
}

/** A route for Gala's server acting for a signed-in person: the secret and the person's token. */
function forPerson(path: string, handle: (ctx: ActionCtx, body: Body, subject: string) => Promise<Response>) {
  return httpAction(async (ctx, request) => {
    const refusal = refuseUnlessServer(request);
    if (refusal !== null) return refusal;
    const subject = await subjectOf(ctx, request, path);
    if (subject === null) return answer(401, { error: "Sign in to continue." });
    try {
      return await handle(ctx, (await request.json()) as Body, subject);
    } catch (error) {
      return answer(400, { error: shortMessage(error) });
    }
  });
}

/**
 * A route inside a turn: the secret, and the turn's id with its project.
 * The functions behind it check that the id holds that project's lock.
 */
function forTurn(handle: (ctx: ActionCtx, turn: { projectId: string; turnId: string }, body: Body) => Promise<Response>) {
  return httpAction(async (ctx, request) => {
    const refusal = refuseUnlessServer(request);
    if (refusal !== null) return refusal;
    try {
      const body = (await request.json()) as Body;
      if (typeof body.projectId !== "string" || typeof body.turnId !== "string") return answer(400, { error: "This turn is over." });
      return await handle(ctx, { projectId: body.projectId, turnId: body.turnId }, body);
    } catch (error) {
      return answer(400, { error: shortMessage(error) });
    }
  });
}

/**
 * A file route. Inside a turn it carries the turn in two headers. The
 * person's token is accepted in its place, which is how the engine called
 * these routes before turns carried an id.
 */
function forFile(path: string, handle: (ctx: ActionCtx, request: Request) => Promise<Response>) {
  return httpAction(async (ctx, request) => {
    const refusal = refuseUnlessServer(request);
    if (refusal !== null) return refusal;
    const projectId = request.headers.get("x-gala-project");
    const turnId = request.headers.get("x-gala-turn");
    const inTurn = projectId !== null && turnId !== null && (await ctx.runQuery(internal.engine.holds, { projectId, turnId }));
    if (!inTurn && (await subjectOf(ctx, request, path)) === null) return answer(401, { error: "This turn is over." });
    return handle(ctx, request);
  });
}

const http = httpRouter();

/** The prompt, for Gala's server at boot. The only way to it. */
http.route({
  path: "/engine/prompt",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const refusal = refuseUnlessServer(request);
    if (refusal !== null) return refusal;
    const prompt = await ctx.runQuery(internal.prompt.read, {});
    if (prompt === null) return answer(404, { error: "No prompt is set." });
    return answer(200, { prompt });
  }),
});

/** Opens a turn. The one step of a turn that needs the person's token. */
http.route({
  path: "/engine/begin",
  method: "POST",
  handler: forPerson("/engine/begin", async (ctx, body, subject) => {
    return answer(200, await ctx.runMutation(internal.engine.begin, { subject, projectId: String(body.projectId), turnId: String(body.turnId) }));
  }),
});

/** Whether the person owns a project. Asked before their request to stop a turn is honored. */
http.route({
  path: "/engine/owns",
  method: "POST",
  handler: forPerson("/engine/owns", async (ctx, body, subject) => {
    return answer(200, { owns: await ctx.runQuery(internal.engine.owns, { subject, projectId: String(body.projectId) }) });
  }),
});

http.route({
  path: "/engine/read",
  method: "POST",
  handler: forTurn(async (ctx, turn) => answer(200, await ctx.runQuery(internal.engine.read, turn))),
});

http.route({
  path: "/engine/write",
  method: "POST",
  handler: forTurn(async (ctx, turn, body) => answer(200, await ctx.runMutation(internal.engine.write, { ...turn, operations: body.operations as never[] }))),
});

/**
 * Closes a turn. The turn's own close always goes through: it needs the
 * secret and the turn's id, never the token, so a turn whose person's
 * token ran out still releases its lock.
 *
 * When the id no longer holds the lock there is nothing to release. That
 * is answered 200 too, except when a token came with the call and is not
 * the owner's: an earlier engine closed a turn under a made-up id to ask
 * "does this person own the project?", and it must not be told yes.
 */
http.route({
  path: "/engine/end",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const refusal = refuseUnlessServer(request);
    if (refusal !== null) return refusal;
    const body = (await request.json().catch(() => ({}))) as Body;
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const turnId = typeof body.turnId === "string" ? body.turnId : "";
    const { released } = await ctx.runMutation(internal.engine.end, { projectId, turnId });
    if (!released && request.headers.has("Authorization")) {
      const subject = await subjectOf(ctx, request, "/engine/end");
      if (subject === null || !(await ctx.runQuery(internal.engine.owns, { subject, projectId }))) return answer(403, { error: "Not allowed." });
    }
    return answer(200, { ok: true, released });
  }),
});

/** Stores a file Gala made (a mark, a kit file) and returns its id. */
http.route({
  path: "/engine/file",
  method: "POST",
  handler: forFile("/engine/file", async (ctx, request) => {
    const fileId = await ctx.storage.store(await request.blob());
    return answer(200, { fileId });
  }),
});

/** Reads a stored file back: a reference the person attached, or a mark from an earlier turn. */
http.route({
  path: "/engine/file",
  method: "GET",
  handler: forFile("/engine/file", async (ctx, request) => {
    const fileId = new URL(request.url).searchParams.get("id");
    const blob = fileId === null ? null : await ctx.storage.get(fileId as Id<"_storage">);
    if (blob === null) return answer(404, { error: "File not found." });
    return new Response(blob, { status: 200, headers: { "Content-Type": blob.type || "application/octet-stream", "Cache-Control": "no-store" } });
  }),
});

/** Files one line of the person's memory under a heading. Outside any turn, so it needs the person's token. */
http.route({
  path: "/engine/memory",
  method: "POST",
  handler: forPerson("/engine/memory", async (ctx, body, subject) => {
    return answer(200, await ctx.runMutation(internal.engine.fileMemory, { subject, memoryId: body.memoryId as Id<"memories">, group: body.group as string }));
  }),
});

export default http;
