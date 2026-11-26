/**
 * Who may start, join or stop a turn, how many turns one account may hold,
 * how long a turn may last, and what the site icon reader may fetch.
 *
 *   node --experimental-strip-types --no-warnings engine/checks/turn-guard.check.ts
 *
 * The routes are driven through the server's real request handler
 * (handleApi) on a local port. Storage is stubbed: the check decides who
 * owns which project and which tokens storage accepts, and storage's "open
 * a turn" call is held open until the check lets it answer, so turns stay
 * running as long as a case needs. A turn that storage was asked to open is
 * a turn that holds a slot: the server asks storage the moment it takes
 * one. The site icon reader runs with name lookups and HTTPS requests
 * stubbed, so every lookup and every request path is recorded and nothing
 * leaves this machine. No model is asked; it runs anywhere.
 *
 * What this proves:
 *   - another account can't join, hold or stop a turn on a project it
 *     doesn't own, and its stop request never says whether a turn runs;
 *   - a caller whose token storage refuses, or whose check storage can't
 *     answer, takes no slot and starts no turn;
 *   - one account holds at most 2 turns at once, even with parallel
 *     requests, while other accounts still get slots, and 12 turns at once
 *     is still the whole server's limit;
 *   - a turn is stopped at its deadline, its slot and its account's count
 *     are freed then, and the deadline is storage's own lock lifetime;
 *   - the site icon reader fetches only the site's origin: no path, query,
 *     fragment or userinfo the model wrote is ever sent, and an over-long
 *     or many-labelled host is refused before any lookup.
 *
 * What it does not prove: storage's own owner check (Convex is stubbed
 * here; convex/engine.ts holds that check), or the page's handling of each
 * answer (src/studio/failures.ts). The host cap narrows what a host name
 * can carry to a DNS server; it doesn't remove it. Several accounts
 * together can still fill the 12 slots.
 */
import { EventEmitter } from "node:events";
import { createServer, request as httpRequest, type Server } from "node:http";
import { createRequire, syncBuiltinESMExports } from "node:module";
import type { AddressInfo } from "node:net";
import { TURN_LIFETIME_MS } from "../../convex/lib/turn.ts";
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";

const h = createHarness("Turn guard and site icon origin");

// --- Storage, stubbed ---------------------------------------------------

const STORAGE = "http://storage.check";
process.env.GALA_CONVEX_SITE_URL = STORAGE;
process.env.GALA_SERVER_SECRET = "s".repeat(40);

/** Which account owns which project. */
const owners = new Map<string, string>();
/** Accounts whose tokens storage refuses as no good (401). */
const refusedAccounts = new Set(["signedout"]);
/** Accounts for which storage can't answer at all (500). */
const failingAccounts = new Set(["unreachable"]);
/** How long storage takes to answer an ownership question; random in the parallel cases. */
let ownsDelay = () => 0;

/** Every "open a turn" storage was asked for, held open until released. */
type Begin = { projectId: string; account: string; release: () => void };
const begins: Begin[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function accountIn(authorization: string | null): string {
  const token = (authorization ?? "").replace(/^Bearer /, "");
  return (JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub: string }).sub;
}

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith(STORAGE)) throw new Error(`The check reached outside storage: ${url}`);
  const path = url.slice(STORAGE.length);
  const headers = new Headers(init?.headers);
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  if (path === "/engine/prompt") return reply(404, { error: "No prompt is set." });
  if (path === "/engine/owns" || path === "/engine/begin") {
    const account = accountIn(headers.get("Authorization"));
    if (path === "/engine/owns") await sleep(ownsDelay());
    if (refusedAccounts.has(account)) return reply(401, { error: "Sign in to continue." });
    if (failingAccounts.has(account)) return reply(500, { error: "Not accepted." });
    if (path === "/engine/owns") return reply(200, { owns: owners.get(String(body.projectId)) === account });
    // Opening a turn: held until the check releases it; then storage says the project is busy, so the turn ends without a model.
    return new Promise<Response>((resolve) => begins.push({ projectId: String(body.projectId), account, release: () => resolve(reply(200, { busy: true })) }));
  }
  return reply(400, { error: "This turn is over." });
}) as typeof fetch;

function tokenFor(account: string): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part({ sub: account, iat: 1, exp: 2 })}.signature`;
}

let projectCount = 0;
/** A new project id owned by `account`. */
function projectOf(account: string): string {
  const id = `project${String(++projectCount).padStart(4, "0")}`;
  owners.set(id, account);
  return id;
}

// --- The server, with its real handler -----------------------------------

const api = (await import("../api.ts")) as typeof import("../api.ts") & { turnLimits?: { deadlineMs: number }; TURN_DEADLINE_MS?: number };
await api.startEngine();
const server: Server = createServer((req, res) => {
  void api.handleApi(req, res, new URL(req.url ?? "/", "http://local").pathname).then((handled) => {
    if (!handled) res.writeHead(404).end();
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;

type Sent = { head: Promise<{ status: number; first: string }>; done: Promise<{ status: number; last: string | null }> };
const open: Promise<unknown>[] = [];

/** One request to the server. `head` is its status and first state; `done`, its last state once the answer ends. */
function send(path: "/api/turn" | "/api/stop", account: string, projectId: string): Sent {
  let resolveHead!: (value: { status: number; first: string }) => void;
  const head = new Promise<{ status: number; first: string }>((resolve) => (resolveHead = resolve));
  const done = new Promise<{ status: number; last: string | null }>((resolve, reject) => {
    const outgoing = httpRequest({ host: "127.0.0.1", port, path, method: "POST", headers: { Authorization: `Bearer ${tokenFor(account)}`, "Content-Type": "application/json" } }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        if (text === "") resolveHead({ status: response.statusCode ?? 0, first: stateOf(chunk.split("\n")[0]!) ?? "" });
        text += chunk;
      });
      response.on("end", () => {
        const lines = text.trim().split("\n");
        resolve({ status: response.statusCode ?? 0, last: stateOf(lines[lines.length - 1]!) });
      });
      response.on("error", reject);
    });
    outgoing.on("error", reject);
    outgoing.end(JSON.stringify({ projectId }));
  });
  open.push(done.catch(() => undefined));
  return { head, done };
}

function stateOf(line: string): string | null {
  try {
    return (JSON.parse(line) as { state?: string }).state ?? null;
  } catch {
    return null;
  }
}

/** A promise, or a failure naming what didn't happen in time. */
function within<T>(ms: number, promise: Promise<T>, what: string): Promise<T> {
  return Promise.race([promise, sleep(ms).then(() => Promise.reject(new Error(`${what}: no answer within ${ms} ms`)))]);
}

const beginsFor = (projectId: string) => begins.filter((begin) => begin.projectId === projectId).length;

/** Lets every held turn end, and waits for every answer, so each case starts with nothing running. */
async function settle(): Promise<void> {
  for (const begin of begins.splice(0)) begin.release();
  await within(5_000, Promise.all(open.splice(0)), "every turn ending");
  await sleep(20);
}

/** A case on the turn routes; whatever it leaves running is ended afterwards, pass or fail. */
function turnCase(name: string, fn: () => Promise<void>): void {
  h.check(name, async () => {
    try {
      await fn();
    } finally {
      await settle();
    }
  });
}

// --- 1. Another account ---------------------------------------------------

turnCase("another account can't join a turn on a project it doesn't own", async () => {
  const project = projectOf("alice");
  const owner = send("/api/turn", "alice", project);
  assertEqual((await within(2_000, owner.head, "the owner's turn")).first, "working", "the owner's turn starts");
  const other = send("/api/turn", "mallory", project);
  const answer = await within(2_000, other.head, "the other account's request");
  assertEqual([answer.status, answer.first], [403, "refused"], "another account joining");
});

turnCase("another account can't hold a slot on a project it doesn't own", async () => {
  const project = projectOf("alice");
  const answer = await within(2_000, send("/api/turn", "mallory", project).head, "the other account's request");
  await sleep(20);
  assertEqual([answer.status, answer.first], [403, "refused"], "another account starting a turn");
  assertEqual(beginsFor(project), 0, "turns storage was asked to open on that project");
});

turnCase("another account can't stop a turn, and never learns whether one runs", async () => {
  const running = projectOf("alice");
  const idle = projectOf("alice");
  await within(2_000, send("/api/turn", "alice", running).head, "the owner's turn");
  const onRunning = await within(2_000, send("/api/stop", "mallory", running).done, "stop on a running project");
  const onIdle = await within(2_000, send("/api/stop", "mallory", idle).done, "stop on an idle project");
  assertEqual([onRunning.status, onRunning.last], [403, "refused"], "another account stopping a running turn");
  assertEqual([onIdle.status, onIdle.last], [403, "refused"], "another account stopping where nothing runs");
  // The owner is answered as before.
  const ownIdle = await within(2_000, send("/api/stop", "alice", idle).done, "the owner's stop where nothing runs");
  assertEqual([ownIdle.status, ownIdle.last], [200, "idle"], "the owner's stop where nothing runs");
  const ownRunning = await within(2_000, send("/api/stop", "alice", running).done, "the owner's stop");
  assertEqual([ownRunning.status, ownRunning.last], [200, "stopped"], "the owner's stop on a running turn");
});

// --- 2. An unverified caller ------------------------------------------------

turnCase("a caller whose token storage refuses takes no slot", async () => {
  const project = projectOf("signedout");
  const before = begins.length;
  const answer = await within(2_000, send("/api/turn", "signedout", project).done, "the request");
  await sleep(20);
  assertEqual([answer.status, answer.last], [401, "signin"], "a refused token");
  assertEqual(begins.length - before, 0, "turns storage was asked to open");
});

turnCase("a caller storage can't check takes no slot", async () => {
  const project = projectOf("unreachable");
  const before = begins.length;
  const answer = await within(2_000, send("/api/turn", "unreachable", project).done, "the request");
  await sleep(20);
  assertEqual([answer.status, answer.last], [403, "refused"], "a check storage couldn't answer");
  assertEqual(begins.length - before, 0, "turns storage was asked to open");
});

// --- 3. The per-account cap ---------------------------------------------------

/** `count` parallel turn requests from one account, each on its own project, with ownership answers in a random order. */
async function parallel(account: string, count: number): Promise<{ started: number; busy: number }> {
  ownsDelay = () => Math.floor(Math.random() * 25);
  const projects = Array.from({ length: count }, () => projectOf(account));
  const heads = await within(3_000, Promise.all(projects.map((project) => send("/api/turn", account, project).head)), "parallel requests");
  ownsDelay = () => 0;
  await sleep(20);
  const busy = heads.filter((head) => head.status === 429 && head.first === "busy").length;
  const started = projects.filter((project) => beginsFor(project) > 0).length;
  return { started, busy };
}

turnCase("one account can't run more than 2 turns; a third parallel request is busy", async () => {
  assertEqual(await parallel("bob", 3), { started: 2, busy: 1 }, "three parallel requests from one account");
});

turnCase("parallel requests can't overshoot the per-account cap", async () => {
  assertEqual(await parallel("carol", 8), { started: 2, busy: 6 }, "eight parallel requests from one account");
});

turnCase("other accounts still get slots while one account is at its cap", async () => {
  await parallel("bob", 2);
  const other = projectOf("dana");
  const answer = await within(2_000, send("/api/turn", "dana", other).head, "another account's request");
  await sleep(20);
  assertEqual([answer.status, answer.first], [200, "working"], "another account's turn");
  assertEqual(beginsFor(other), 1, "turns storage was asked to open for it");
});

turnCase("12 turns at once is still the whole server's limit", async () => {
  const accounts = Array.from({ length: 7 }, (_, index) => `many${index}`);
  for (const account of accounts.slice(0, 6)) {
    for (let turn = 0; turn < 2; turn++) await within(2_000, send("/api/turn", account, projectOf(account)).head, "a turn");
  }
  const thirteenth = projectOf(accounts[6]!);
  const answer = await within(2_000, send("/api/turn", accounts[6]!, thirteenth).head, "the thirteenth turn");
  await sleep(20);
  assertEqual(begins.length, 12, "turns running");
  assertEqual([answer.status, answer.first, beginsFor(thirteenth)], [429, "busy", 0], "the thirteenth turn");
});

// --- 4. The deadline ------------------------------------------------------------

h.check("the server's turn deadline is storage's lock lifetime", () => {
  assertEqual(api.TURN_DEADLINE_MS, TURN_LIFETIME_MS, "the server's deadline against convex/lib/turn.ts");
  assertEqual(api.turnLimits?.deadlineMs, TURN_LIFETIME_MS, "the deadline the server runs with");
});

turnCase("a turn is stopped at its deadline, and its slot and count are freed", async () => {
  const shortened = 200;
  const original = api.turnLimits?.deadlineMs;
  if (api.turnLimits !== undefined) api.turnLimits.deadlineMs = shortened;
  try {
    const project = projectOf("erin");
    const first = send("/api/turn", "erin", project);
    await within(2_000, first.head, "the turn");
    const held = begins.find((begin) => begin.projectId === project)!;
    // Storage's "open a turn" is still held: only the deadline can end this turn.
    const ended = await within(shortened + 1_500, first.done, "the turn ending at its deadline");
    assertEqual(ended.last, "stopped", "how the turn ended");
    // The slot is free: the same project starts afresh. The count is free: the account has room for one more, and no more.
    const again = send("/api/turn", "erin", project);
    const second = send("/api/turn", "erin", projectOf("erin"));
    const third = send("/api/turn", "erin", projectOf("erin"));
    const heads = await within(2_000, Promise.all([again.head, second.head, third.head]), "turns after the deadline");
    await sleep(20);
    assertEqual(beginsFor(project), 2, "turns storage was asked to open on the same project");
    assertEqual(heads.map((head) => head.first).sort(), ["busy", "working", "working"], "the account's next three requests");
    // The stopped turn's late end doesn't free the slot its project now has again.
    held.release();
    await sleep(50);
    await within(2_000, send("/api/turn", "erin", project).head, "joining the new turn");
    await sleep(20);
    assertEqual(beginsFor(project), 2, "the new turn is joined, not opened a third time");
  } finally {
    if (api.turnLimits !== undefined && original !== undefined) api.turnLimits.deadlineMs = original;
  }
});

// --- 5. The site icon's origin ------------------------------------------------------

const require = createRequire(import.meta.url);
const lookups: string[] = [];
const requests: { host: string; path: string }[] = [];
const dns = require("node:dns/promises") as { lookup: unknown };
dns.lookup = async (host: string) => {
  lookups.push(host);
  return [{ address: "93.184.216.34", family: 4 }];
};
const https = require("node:https") as { request: unknown };
https.request = (options: { hostname: string; path: string }, callback: (response: EventEmitter) => void) => {
  requests.push({ host: options.hostname, path: options.path });
  const outgoing = Object.assign(new EventEmitter(), {
    end: () =>
      setImmediate(() => {
        // Every answer is a 404 with no page, so the reader walks its whole list of places to look.
        callback(Object.assign(new EventEmitter(), { statusCode: 404, headers: {}, destroy: () => undefined }));
      }),
  });
  return outgoing;
};
syncBuiltinESMExports();
const { siteIcon } = await import("../siteIcon.ts");

async function fetchedFor(site: string): Promise<{ lookups: string[]; requests: { host: string; path: string }[] }> {
  lookups.length = 0;
  requests.length = 0;
  await within(5_000, siteIcon(site), `the icon for ${site}`);
  return { lookups: [...lookups], requests: [...requests] };
}

h.check("the site icon reader requests only the site's origin", async () => {
  const sites = ["https://www.example.com/carried/words?memory=private#more", "www.example.com/a/b?c=d", "https://someone:private@www.example.com/path", "http://www.example.com/?q=private"];
  for (const site of sites) {
    const seen = await fetchedFor(site);
    const own = seen.requests.filter((entry) => entry.host === "www.example.com");
    assert(own.length > 0 && own[0]!.path === "/", `${site}: the first request is for / (got ${JSON.stringify(seen.requests)})`);
    assert(
      own.every((entry) => entry.path === "/" || entry.path === "/favicon.ico"),
      `${site}: only / and /favicon.ico are asked of the site (got ${JSON.stringify(own.map((entry) => entry.path))})`,
    );
    const everything = JSON.stringify(seen);
    for (const carried of ["carried", "memory", "private", "someone", "/a/b", "more"]) assert(!everything.includes(carried), `${site}: "${carried}" was sent (${everything})`);
  }
});

h.check("an over-long or many-labelled host is refused before any lookup", async () => {
  const refused = ["https://one.two.three.example.com", `https://${"x".repeat(60)}.com`, "carried.words.in.labels.example.com/"];
  for (const site of refused) {
    const seen = await fetchedFor(site);
    assertEqual([seen.lookups.length, seen.requests.length], [0, 0], `${site}: lookups and requests`);
  }
  // A brand's home host of four labels is still read.
  const allowed = await fetchedFor("https://www.brand.co.uk");
  assert(allowed.requests.some((entry) => entry.host === "www.brand.co.uk" && entry.path === "/"), "a four-label host is still read");
});

h.check("a site that isn't a public https host is still refused", async () => {
  for (const site of ["https://www.example.com:8443/", "https://10.0.0.1/", "ftp://www.example.com/", "https://localhost/", "javascript:alert(1)"]) {
    const seen = await fetchedFor(site);
    assertEqual(seen.requests.length, 0, `${site}: requests`);
  }
});

try {
  await h.run();
} finally {
  for (const begin of begins.splice(0)) begin.release();
  server.close();
  // Turns that were never released (a failed case) keep timers alive; the run is over either way.
  setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
}
