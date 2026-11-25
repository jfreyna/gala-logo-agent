/**
 * The engine's half of scripts/check-turn.mjs: runs one real turn on a turn
 * that is already open, with no sign-in token at all.
 *
 *   node --env-file=<the server's settings> engine/checks/turn-on-id.ts <project id> <turn id>
 *
 * The turn was opened elsewhere (by the project's owner). From here on the
 * engine has only the shared secret and the turn's id, which is exactly
 * what it has after a person's token runs out. It prints how the turn
 * ended. See scripts/check-turn.mjs for what the pair proves.
 */
import { runTurn } from "../loop.ts";
import { assertComplete, loadPrompt } from "../prompt.ts";
import { ConvexStore } from "../store-convex.ts";

const [projectId, turnId] = process.argv.slice(2);
if (!projectId || !turnId) throw new Error("Usage: turn-on-id.ts <project id> <turn id>");

const prompt = await loadPrompt();
assertComplete(prompt);
const store = new ConvexStore({ projectId, turnId, token: null });
console.log(`turn ended: ${await runTurn(store, prompt, new AbortController().signal)} (prompt: ${prompt.source})`);
