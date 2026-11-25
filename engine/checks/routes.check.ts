/**
 * The storage routes' own refusals, asked the way a stranger, a signed-in
 * person without a turn, and Gala's server without a turn would ask.
 *
 *   node --env-file=<the server's settings> engine/checks/routes.check.ts
 *
 * It needs the shared secret from the server's environment, which it sends
 * and never prints, so it runs on the Sprite. It sends no real sign-in
 * token: every call here is one that must be refused, or must do nothing.
 *
 * What this proves: without the secret nothing answers; with the secret
 * but no open turn, nothing can be read, written or stored; a forged token
 * opens no turn; closing under a made-up id releases nothing and reports
 * no ownership to a forged token.
 * What it does not: the accepted paths. Those are shown by the storage
 * check (the functions behind the routes), by turn.check.ts (a whole turn
 * through these routes on its id alone), and by a person signing in.
 */
import { assertEqual, createHarness } from "../../kit/scripts/harness.ts";
import { config } from "../config.ts";

const secret = config.serverSecret;
if (secret === null) throw new Error("GALA_SERVER_SECRET is not set.");
/** Shaped like a token, signed by no one. */
const FORGED = "eyJhbGciOiJub25lIn0.eyJzdWIiOiJub2JvZHkifQ.c2lnbmF0dXJl";
const nowhere = { projectId: "js7notaprojectidatall00000000000", turnId: "00000000-0000-4000-8000-000000000000" };

async function ask(path: string, options: { secret?: boolean; token?: string; turn?: boolean; body?: unknown; method?: string } = {}): Promise<[number, string]> {
  const response = await fetch(`${config.storageUrl}${path}`, {
    method: options.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.secret === false ? {} : { "x-gala-server": secret! }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.turn ? { "x-gala-project": nowhere.projectId, "x-gala-turn": nowhere.turnId } : {}),
    },
    body: options.method === "GET" ? undefined : JSON.stringify(options.body ?? nowhere),
  });
  const body = await response.json().catch(() => ({}));
  return [response.status, String(body.error ?? (body.released === false ? "nothing released" : ""))];
}

const h = createHarness("Storage routes: refusals");

for (const path of ["/engine/prompt", "/engine/begin", "/engine/read", "/engine/write", "/engine/end", "/engine/owns", "/engine/file", "/engine/memory"]) {
  h.check(`${path} without the shared secret: 401`, async () => assertEqual((await ask(path, { secret: false, token: FORGED }))[0], 401, "status"));
}

h.check("begin with the secret and no sign-in: 401, Sign in to continue", async () => assertEqual(await ask("/engine/begin"), [401, "Sign in to continue."], "answer"));
h.check("begin with the secret and a forged token: 401", async () => assertEqual((await ask("/engine/begin", { token: FORGED }))[0], 401, "status"));
h.check("read with the secret and a turn that is not open: refused, This turn is over", async () => assertEqual(await ask("/engine/read"), [400, "This turn is over."], "answer"));
h.check("write with the secret and a turn that is not open: refused, This turn is over", async () => assertEqual(await ask("/engine/write", { body: { ...nowhere, operations: [{ op: "say", text: "Not mine to write." }] } }), [400, "This turn is over."], "answer"));
h.check("write with the secret and no turn named: refused", async () => assertEqual((await ask("/engine/write", { body: { operations: [] } }))[0], 400, "status"));
h.check("storing a file with the secret and a turn that is not open: 401", async () => assertEqual((await ask("/engine/file", { turn: true }))[0], 401, "status"));
h.check("reading a file with the secret and no turn: 401", async () => assertEqual((await ask("/engine/file?id=nothing", { method: "GET" }))[0], 401, "status"));
h.check("closing under a made-up id: 200, and nothing is released", async () => assertEqual(await ask("/engine/end"), [200, "nothing released"], "answer"));
h.check("closing under a made-up id with a forged token: 403, so it tells no one they own a project", async () => assertEqual((await ask("/engine/end", { token: FORGED }))[0], 403, "status"));
h.check("ownership with a forged token: 401", async () => assertEqual((await ask("/engine/owns", { token: FORGED }))[0], 401, "status"));
h.check("filing a memory line with no sign-in: 401", async () => assertEqual((await ask("/engine/memory", { body: { memoryId: "x", group: "About you" } }))[0], 401, "status"));

await h.run();
