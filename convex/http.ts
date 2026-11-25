import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * The routes Gala's server calls. Nothing here is for browsers.
 *
 * Two proofs guard them:
 *   - The shared secret, in the `x-gala-server` header. Only Gala's server
 *     on the Sprite holds it, so it says "this is Gala's server".
 *   - The person's own sign-in token, in `Authorization`. It says whose
 *     project the call is about, and the functions behind the routes check
 *     that the project belongs to that person.
 *
 * `/engine/prompt` needs the secret alone: it is fetched once at boot,
 * before anyone has signed in. Every other route needs both, so the secret
 * by itself cannot touch a project, and a signed-in person without it
 * cannot write as Gala.
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

/** The signed-in person's account, or null. */
async function subjectOf(ctx: ActionCtx): Promise<string | null> {
  try {
    const identity = await ctx.auth.getUserIdentity();
    return identity === null ? null : identity.subject;
  } catch {
    // A token that is malformed or not signed by Frilly.
    return null;
  }
}

/** Runs a route for Gala's server acting for a signed-in person. */
function forPerson(handle: (ctx: ActionCtx, request: Request, subject: string) => Promise<Response>) {
  return httpAction(async (ctx, request) => {
    const refusal = refuseUnlessServer(request);
    if (refusal !== null) return refusal;
    const subject = await subjectOf(ctx);
    if (subject === null) return answer(401, { error: "Sign in to continue." });
    try {
      return await handle(ctx, request, subject);
    } catch (error) {
      // Function errors here are the short ones written in convex/engine.ts.
      return answer(400, { error: error instanceof Error ? error.message : "Something went wrong." });
    }
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

http.route({
  path: "/engine/begin",
  method: "POST",
  handler: forPerson(async (ctx, request, subject) => {
    const { projectId, turnId } = (await request.json()) as { projectId: Id<"projects">; turnId: string };
    return answer(200, await ctx.runMutation(internal.engine.begin, { subject, projectId, turnId }));
  }),
});

http.route({
  path: "/engine/write",
  method: "POST",
  handler: forPerson(async (ctx, request, subject) => {
    const { projectId, turnId, operations } = (await request.json()) as { projectId: Id<"projects">; turnId: string; operations: never[] };
    return answer(200, await ctx.runMutation(internal.engine.write, { subject, projectId, turnId, operations }));
  }),
});

http.route({
  path: "/engine/end",
  method: "POST",
  handler: forPerson(async (ctx, request, subject) => {
    const { projectId, turnId } = (await request.json()) as { projectId: Id<"projects">; turnId: string };
    await ctx.runMutation(internal.engine.end, { subject, projectId, turnId });
    return answer(200, { ok: true });
  }),
});

/** Stores a file Gala made (a mark, a kit file) and returns its id. */
http.route({
  path: "/engine/file",
  method: "POST",
  handler: forPerson(async (ctx, request) => {
    const fileId = await ctx.storage.store(await request.blob());
    return answer(200, { fileId });
  }),
});

/** Reads a stored file back: a reference the person attached, or a mark from an earlier turn. */
http.route({
  path: "/engine/file",
  method: "GET",
  handler: forPerson(async (ctx, request) => {
    const fileId = new URL(request.url).searchParams.get("id");
    const blob = fileId === null ? null : await ctx.storage.get(fileId as Id<"_storage">);
    if (blob === null) return answer(404, { error: "File not found." });
    return new Response(blob, { status: 200, headers: { "Content-Type": blob.type || "application/octet-stream", "Cache-Control": "no-store" } });
  }),
});

/** Reads one line of the person's memory, so its heading can be chosen, then files it. */
http.route({
  path: "/engine/memory",
  method: "POST",
  handler: forPerson(async (ctx, request, subject) => {
    const { memoryId, group } = (await request.json()) as { memoryId: Id<"memories">; group: string };
    return answer(200, await ctx.runMutation(internal.engine.fileMemory, { subject, memoryId, group }));
  }),
});

export default http;
