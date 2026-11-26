/**
 * The server's limits on what an outside request or an outside site can
 * make it do.
 *
 *   node --experimental-strip-types --no-warnings engine/checks/audit-leads.check.ts
 *
 * Runs anywhere, with nothing sent off this machine: the server is started
 * on a local port for the first case; storage and Jev are stubbed for the
 * routes and the reply check; name lookups and HTTPS requests are stubbed
 * for the icon reader, so every lookup and request is recorded.
 *
 * What this proves:
 *   - a request target that doesn't parse as an address is answered 400,
 *     and the server goes on answering;
 *   - a memory request whose token storage refuses makes no Jev call;
 *   - the SVG test reads a run of comments in linear time (timed at two
 *     sizes, then at the most bytes it ever reads);
 *   - an icon stating a huge or very lopsided size is not drawn;
 *   - the icon reader follows at most its cap of a page's icon links, and
 *     gives up on a site at its time budget even while name lookups hang;
 *   - a steering detail that fails the reply check is dropped, and one that
 *     passes is kept;
 *   - a turn opens at most 4 attached images and 20 MB, reads a repeated
 *     file once, names the images it didn't open, and storage's file read
 *     refuses a file past the budget by its stated size before reading it;
 *   - finishUpload records only a file stored in the last few minutes and
 *     not already recorded on the project, and never records an over-cap
 *     file (an unrecorded file can't be used anywhere).
 *
 * What it does not prove: that a recorded file was stored by the person
 * recording it (nothing records who asked for an upload address; the
 * freshness window only narrows which files can be named); whether Convex
 * undoes the delete of an over-cap file when finishUpload then refuses it
 * (its handler runs here on stubs, outside a real transaction; either way
 * the file is never recorded, so it can't be used); storage's own checks (Convex is stubbed), how
 * the renderer behaves on a file this lets through, or that a real model
 * would write such a detail. The timing case compares sizes on this
 * machine, so a very busy machine can make it noisy; it fails only on
 * growth far past linear.
 */
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { createServer, type Server } from "node:http";
import { createRequire, register, syncBuiltinESMExports } from "node:module";
import { connect, type AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { assert, assertEqual, createHarness } from "../../kit/scripts/harness.ts";

const h = createHarness("Limits on outside requests and outside sites");

const STORAGE = "http://storage.check";
const JEV = "http://jev.check";
process.env.GALA_CONVEX_SITE_URL = STORAGE;
process.env.GALA_TYPESAFE_URL = JEV;
process.env.GALA_SERVER_SECRET = "s".repeat(40);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function within<T>(ms: number, promise: Promise<T>, what: string): Promise<T> {
  return Promise.race([promise, sleep(ms).then(() => Promise.reject(new Error(`${what}: no answer within ${ms} ms`)))]);
}

// --- Storage and Jev, stubbed -------------------------------------------------

const jevCalls: unknown[] = [];
const storageCalls: string[] = [];
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith(JEV)) {
    jevCalls.push(init?.body);
    // Every text reads as an ordinary reply: well under the gate on both leak questions.
    return reply(200, {
      answers: {
        first: { noul: 0.05 },
        second: { noul: 0.05 },
        heading: { choice: "About you", confidence: 0.9, probabilities: {} },
      },
    });
  }
  if (url.startsWith(STORAGE)) {
    storageCalls.push(url.slice(STORAGE.length));
    if (url.endsWith("/engine/prompt")) return reply(404, { error: "No prompt is set." });
    // Every token this check sends is one storage refuses.
    return reply(401, { error: "Sign in to continue." });
  }
  throw new Error(`The check reached outside its stubs: ${url}`);
}) as typeof fetch;

// --- 4. A request target that doesn't parse ----------------------------------------

/** Sends raw request text and returns the status line, or null when nothing answered. */
function raw(port: number, text: string): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    let answer = "";
    socket.on("connect", () => socket.write(text));
    socket.on("data", (chunk) => {
      answer += chunk.toString("latin1");
      if (answer.includes("\r\n")) socket.destroy();
    });
    socket.on("close", () => resolve(answer === "" ? null : answer.split("\r\n")[0]!));
    socket.on("error", () => resolve(null));
    socket.setTimeout(3_000, () => socket.destroy());
  });
}

h.check("a request target that doesn't parse is answered 400, and the server keeps answering", async () => {
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  const serverFile = fileURLToPath(new URL("../../server/index.mjs", import.meta.url));
  // The server alone, with no engine settings: it answers /healthz, and /api says "unavailable".
  const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", serverFile], {
    env: { PATH: process.env.PATH, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await within(10_000, new Promise<void>((resolve) => child.stdout.on("data", (chunk) => String(chunk).includes("listening") && resolve())), "the server starting");
    const bad = await raw(port, "GET // HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n");
    await sleep(300);
    const after = await raw(port, "GET /healthz HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n");
    assertEqual(bad, "HTTP/1.1 400 Bad Request", "the unparseable target");
    assertEqual(after, "HTTP/1.1 200 OK", "the next request");
  } finally {
    child.kill();
  }
});

// --- 5. Memory: the token first --------------------------------------------------------

const api = await import("../api.ts");
await api.startEngine();
const server: Server = createServer((req, res) => void api.handleApi(req, res, new URL(req.url ?? "/", "http://local").pathname));
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const apiPort = (server.address() as AddressInfo).port;

h.check("a memory request whose token storage refuses makes no Jev call", async () => {
  jevCalls.length = 0;
  storageCalls.length = 0;
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${part({ alg: "RS256" })}.${part({ sub: "signedout" })}.signature`;
  const answer = await within(
    5_000,
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const outgoing = createRequire(import.meta.url)("node:http").request(
        {
          host: "127.0.0.1",
          port: apiPort,
          path: "/api/memory",
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
        (response: NodeJS.ReadableStream & { statusCode: number }) => {
          let body = "";
          response.on("data", (chunk) => (body += String(chunk)));
          response.on("end", () => resolve({ status: response.statusCode, body }));
        },
      );
      outgoing.on("error", reject);
      outgoing.end(
        JSON.stringify({
          memoryId: "memory0001",
          text: "I like quiet serif type.",
        }),
      );
    }),
    "the memory request",
  );
  assertEqual(jevCalls.length, 0, "Jev calls");
  assert(answer.status >= 400, `the answer is a refusal (got ${answer.status} ${answer.body})`);
  assert(storageCalls.length > 0, "storage was asked about the token");
});

// --- 6. The icon reader ---------------------------------------------------------------

const require = createRequire(import.meta.url);
const lookups: string[] = [];
const requests: { host: string; path: string }[] = [];
/** Hosts whose lookups never answer. */
const hanging = new Set<string>();
/** What the stub site serves: the home page, by host. Everything else is a 404. */
const pages = new Map<string, string>();
const dns = require("node:dns/promises") as { lookup: unknown };
dns.lookup = (host: string) => {
  lookups.push(host);
  if (hanging.has(host)) return new Promise(() => undefined);
  return Promise.resolve([{ address: "93.184.216.34", family: 4 }]);
};
const https = require("node:https") as { request: unknown };
https.request = (options: { hostname: string; path: string }, callback: (response: EventEmitter) => void) => {
  requests.push({ host: options.hostname, path: options.path });
  const page = options.path === "/" ? pages.get(options.hostname) : undefined;
  return Object.assign(new EventEmitter(), {
    end: () =>
      setImmediate(() => {
        const response = Object.assign(new EventEmitter(), {
          statusCode: page === undefined ? 404 : 200,
          headers: page === undefined ? {} : { "content-type": "text/html" },
          destroy: () => undefined,
        });
        callback(response);
        if (page !== undefined) {
          response.emit("data", Buffer.from(page));
          response.emit("end");
        }
      }),
  });
};
syncBuiltinESMExports();
const icons = (await import("../siteIcon.ts")) as typeof import("../siteIcon.ts") & {
  iconLimits?: { candidates: number; siteBudgetMs: number; lookupMs: number };
};

/**
 * Times the SVG test on a run of comments with no svg tag after them, in a
 * separate process stopped after a few seconds, so a test that backtracks
 * can't stall this check. Each size's time is printed as soon as it's known.
 */
async function timeSniff(sizes: number[]): Promise<Map<number, number>> {
  const module = new URL("../siteIcon.ts", import.meta.url).href;
  const code = `import { storable } from ${JSON.stringify(module)};
for (const n of ${JSON.stringify(sizes)}) {
  const bytes = new TextEncoder().encode("<!---->".repeat(n) + "x");
  let best = Infinity;
  for (let i = 0; i < 3; i++) { const start = performance.now(); storable("image/x-icon", bytes); best = Math.min(best, performance.now() - start); }
  console.log(n + " " + best);
}`;
  const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "inherit"] });
  const times = new Map<number, number>();
  child.stdout.on("data", (chunk) => {
    for (const line of String(chunk).trim().split("\n")) {
      const [n, ms] = line.split(" ").map(Number);
      if (Number.isFinite(n) && Number.isFinite(ms)) times.set(n!, ms!);
    }
  });
  await new Promise<void>((resolve) => {
    const stop = setTimeout(() => child.kill("SIGKILL"), 5_000);
    child.on("exit", () => {
      clearTimeout(stop);
      resolve();
    });
  });
  return times;
}

h.check("the SVG test reads a run of comments in linear time", async () => {
  const times = await timeSniff([16, 22, 73]);
  const at = (n: number) => (times.has(n) ? `${times.get(n)!.toFixed(2)} ms` : "stopped after 5 s");
  // Linear: six more comments cost almost nothing. A test that backtracks doubles per comment, about 64 times.
  assert(times.has(16) && times.has(22) && times.get(22)! < times.get(16)! * 6 + 2, `16 comments: ${at(16)}, 22 comments: ${at(22)}`);
  // The most it ever reads: 73 comments, 511 bytes.
  assert(times.has(73) && times.get(73)! < 50, `73 comments: ${at(73)}`);
});

/** A PNG header stating a size, and nothing else. */
function pngStating(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function notDrawn(png: Uint8Array | null, what: string): void {
  assert(png === null, `${what} was drawn (${png?.length} bytes of PNG)`);
}

h.check("an icon stating a huge or lopsided size is not drawn", () => {
  // Sizes small enough to draw safely before this limit existed, but past it.
  notDrawn(icons.storable("image/png", pngStating(120, 2_000)), "a PNG 120 by 2000");
  notDrawn(icons.storable("image/png", pngStating(9_000, 9_000)), "a PNG 9000 by 9000");
  const tall = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="200"><rect width="10" height="200" fill="#123456"/></svg>`;
  notDrawn(icons.storable("image/svg+xml", new TextEncoder().encode(tall)), "an SVG 10 by 200");
  const unread = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="9in"><rect width="10" height="10"/></svg>`;
  notDrawn(icons.storable("image/svg+xml", new TextEncoder().encode(unread)), "an SVG sized in units not read here");
  // An ordinary square icon is still drawn.
  const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#123456"/></svg>`;
  assert(icons.storable("image/svg+xml", new TextEncoder().encode(square)) !== null, "a square SVG is drawn");
});

h.check("the icon reader follows at most its cap of a page's icon links", async () => {
  const links = Array.from({ length: 40 }, (_, index) => `<link rel="icon" sizes="${200 + index}x${200 + index}" href="/icon-${index}.png">`).join("\n");
  pages.set("www.many-icons.com", `<html><head>${links}</head></html>`);
  lookups.length = 0;
  requests.length = 0;
  await within(10_000, icons.siteIcon("https://www.many-icons.com"), "the icon reader");
  const iconRequests = requests.filter((entry) => entry.path.startsWith("/icon-")).length;
  assert(iconRequests <= 8, `icon links followed: ${iconRequests} of 40`);
  // The best links come first: the largest stated size is the first one tried.
  assertEqual(requests.find((entry) => entry.path.startsWith("/icon-"))?.path, "/icon-39.png", "the first icon link tried");
});

h.check("the icon reader gives up on a site at its time budget, even while lookups hang", async () => {
  const links = Array.from({ length: 6 }, (_, index) => `<link rel="icon" href="https://slow${index}.example.net/icon.png">`).join("\n");
  pages.set("www.slow-links.com", `<html><head>${links}</head></html>`);
  for (let index = 0; index < 6; index++) hanging.add(`slow${index}.example.net`);
  const original = icons.iconLimits === undefined ? undefined : { ...icons.iconLimits };
  if (icons.iconLimits !== undefined) Object.assign(icons.iconLimits, { siteBudgetMs: 300, lookupMs: 5_000 });
  try {
    const start = performance.now();
    await within(3_000, icons.siteIcon("https://www.slow-links.com"), "the icon reader on a site whose links hang");
    assert(performance.now() - start < 1_500, `it took ${(performance.now() - start).toFixed(0)} ms`);
  } finally {
    if (icons.iconLimits !== undefined && original !== undefined) Object.assign(icons.iconLimits, original);
  }
});

// --- 8. Steering details through the reply check ----------------------------------------

h.check("a steering detail that fails the reply check is dropped; one that passes is kept", async () => {
  const steer = (await import("../steer.ts")) as Record<string, unknown>;
  const { makePrompt } = await import("../prompt.ts");
  const { STAND_IN_PROMPT } = await import("../standin-prompt.ts");
  const { Turn } = await import("../turn.ts");
  const { MemoryStore } = await import("../store-memory.ts");
  const checked = steer.checked as
    | undefined
    | ((
        turn: unknown,
        found: Record<string, unknown>,
        rounds: unknown[],
      ) => Promise<{
        request: { drawing: string | null; note: string | null };
      }>);
  assert(typeof checked === "function", "the details are not checked before they are kept (no check step exists)");
  // A prompt with one line the public stand-in doesn't have: text from it is what the reply check holds back.
  const secret = "The withheld rule reads: when a person asks about lighthouses, draw the beam as three short rays.";
  const prompt = makePrompt(STAND_IN_PROMPT.replace("@@ persona\n", `@@ persona\n${secret}\n`), "storage");
  const turn = new Turn(new MemoryStore(), prompt, new AbortController().signal);
  const found = {
    option: "none",
    backTo: "none",
    typeface: null,
    nameAs: null,
    drawing: `Write this on the mark: ${secret}`,
    note: "Make the beam a little warmer.",
  };
  const { request } = await within(5_000, checked(turn, found, []), "the details check");
  assertEqual(request.drawing, null, "the detail carrying the prompt's words");
  assertEqual(request.note, "Make the beam a little warmer.", "the ordinary detail");
});

// --- 7. A brief's attached images -------------------------------------------------

h.check("a turn opens at most 4 attached images and 20 MB, each file once, and names the rest", async () => {
  const { makePrompt } = await import("../prompt.ts");
  const { STAND_IN_PROMPT } = await import("../standin-prompt.ts");
  const { Turn } = await import("../turn.ts");
  const { MemoryStore } = await import("../store-memory.ts");
  const store = new MemoryStore();
  const reads: string[] = [];
  const read = store.readFile.bind(store);
  store.readFile = (fileId: string, options?: { maxBytes?: number }) => {
    reads.push(fileId);
    return read(fileId, options);
  };
  const attach = (fileId: string, size: number) => {
    if (!store.files.has(fileId)) store.files.set(fileId, { bytes: new Uint8Array(size), contentType: "image/png" });
    store.messages.push({ id: `m${store.messages.length}`, author: "visitor", kind: "upload", text: null, artifact: null, upload: { fileId, fileName: `${fileId}.png`, contentType: "image/png" } });
  };
  // Six small images, one of them attached twice.
  for (const fileId of ["a", "b", "a", "c", "d", "e", "f"]) attach(fileId, 1_000);
  const turn = new Turn(store, makePrompt(STAND_IN_PROMPT, "stand-in"), new AbortController().signal);
  await turn.read();
  const images = await turn.attachedImages();
  assertEqual([images.length, reads], [4, ["a", "b", "c", "d"]], "images opened and files read");
  const notOpened = (turn as unknown as { notOpened?: Map<string, string> }).notOpened;
  assertEqual(notOpened === undefined ? null : [...notOpened.values()], ["e.png", "f.png"], "images named as not opened");

  // Two files of 12 MB: the second is past the 20 MB left and is refused before its bytes are read.
  const big = new MemoryStore();
  const bigReads: (number | undefined)[] = [];
  const bigRead = big.readFile.bind(big);
  big.readFile = (fileId: string, options?: { maxBytes?: number }) => {
    bigReads.push(options?.maxBytes);
    return bigRead(fileId, options);
  };
  for (const fileId of ["x", "y"]) {
    big.files.set(fileId, { bytes: new Uint8Array(12 * 1024 * 1024), contentType: "image/png" });
    big.messages.push({ id: fileId, author: "visitor", kind: "upload", text: null, artifact: null, upload: { fileId, fileName: `${fileId}.png`, contentType: "image/png" } });
  }
  const bigTurn = new Turn(big, makePrompt(STAND_IN_PROMPT, "stand-in"), new AbortController().signal);
  await bigTurn.read();
  assertEqual((await bigTurn.attachedImages()).length, 1, "12 MB images opened out of two");
  assertEqual(bigReads, [20 * 1024 * 1024, 8 * 1024 * 1024], "the byte budget each read was given");
});

h.check("storage's file read refuses a file over the budget by its stated size, before reading the body", async () => {
  const { ConvexStore } = await import("../store-convex.ts");
  let pulled = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(new ReadableStream({ pull: (controller) => (++pulled > 15 ? controller.close() : controller.enqueue(new Uint8Array(1024 * 1024))) }), {
      status: 200,
      headers: { "Content-Type": "image/png", "Content-Length": String(15 * 1024 * 1024) },
    })) as typeof fetch;
  try {
    const store = new ConvexStore({ projectId: "project0001", turnId: "turn", token: null });
    const outcome = await store.readFile("file0001", { maxBytes: 10 * 1024 * 1024 }).then(
      (file) => `read ${file.bytes.length} bytes`,
      (error: Error) => error.constructor.name,
    );
    assertEqual(outcome, "FileTooLarge", "a 15 MB file read with 10 MB left");
    assert(pulled <= 1, `body chunks read: ${pulled}`);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// --- 9 and 10. Recording an upload ----------------------------------------------------

/** Lets Node resolve an import with no extension (Convex's style) to the .ts or .js file beside it. */
register(
  `data:text/javascript,${encodeURIComponent(`export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); } catch (error) {
    if (!specifier.startsWith(".") || /\\.[a-z]+$/.test(specifier)) throw error;
    for (const extension of [".ts", ".js"]) { try { return await next(specifier + extension, context); } catch {} }
    throw error;
  }
}`)}`,
);

type Stored = { _creationTime: number; size: number; contentType: string };
/** finishUpload's own handler, on a storage of stubs: who is signed in, which projects, files and upload rows exist. */
async function finish(options: { file: Stored | null; recorded?: string[] }): Promise<{ outcome: string; inserted: number; deleted: number }> {
  // Convex's files import each other without extensions, as its bundler allows; the hook below lets Node find them.
  const uploads = (await import(new URL("../../convex/uploads.ts", import.meta.url).href)) as { finishUpload: { _handler: (ctx: unknown, args: unknown) => Promise<unknown> } };
  let inserted = 0;
  let deleted = 0;
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "alice" }) },
    db: {
      get: async () => ({ _id: "project0001", ownerSubject: "alice" }),
      system: { get: async () => options.file },
      query: () => ({ withIndex: () => ({ collect: async () => (options.recorded ?? []).map((fileId) => ({ fileId, projectId: "project0001" })) }) }),
      insert: async () => (inserted++, "upload0001"),
    },
    storage: { delete: async () => void deleted++ },
  };
  const outcome = await uploads.finishUpload._handler(ctx, { projectId: "project0001", fileId: "file0001", fileName: "reference.png" }).then(
    () => "recorded",
    (error: Error) => `refused: ${error.message}`,
  );
  return { outcome, inserted, deleted };
}

h.check("finishUpload records only a freshly stored file not already recorded on the project", async () => {
  const now = Date.now();
  const old = await finish({ file: { _creationTime: now - 60 * 60 * 1000, size: 1_000, contentType: "image/png" } });
  assertEqual([old.outcome, old.inserted], ["refused: File not found.", 0], "a file stored an hour ago (someone else's, say)");
  const again = await finish({ file: { _creationTime: now - 1_000, size: 1_000, contentType: "image/png" }, recorded: ["file0001"] });
  assertEqual([again.outcome, again.inserted], ["refused: File not found.", 0], "a file already recorded on this project");
  const missing = await finish({ file: null });
  assertEqual([missing.outcome, missing.inserted], ["refused: File not found.", 0], "a file that doesn't exist");
  const fresh = await finish({ file: { _creationTime: now - 2_000, size: 1_000, contentType: "image/png" } });
  assertEqual([fresh.outcome, fresh.inserted], ["recorded", 1], "a file stored just now");
});

h.check("an over-cap file is never recorded, so it can't be used", async () => {
  const over = await finish({ file: { _creationTime: Date.now() - 2_000, size: 10 * 1024 * 1024 + 1, contentType: "image/png" } });
  assertEqual([over.outcome.startsWith("refused"), over.inserted], [true, 0], "a fresh file one byte over 10 MB");
});

try {
  await h.run();
} finally {
  server.close();
  setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
}
