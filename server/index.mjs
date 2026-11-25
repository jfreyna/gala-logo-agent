/**
 * Gala's server, as it runs on the Sprite.
 *
 * It serves the built web app and nothing else yet; the agent loop joins it
 * under /api. It has no dependencies beyond Node.
 *
 * Because Frilly trusts this origin with sign-ins, three rules hold here:
 *   1. It never redirects. No response sends a browser to an address taken
 *      from a request, so a crafted link can't walk a sign-in elsewhere.
 *   2. It never logs a query string. A Google return carries a one-time
 *      sign-in token in the URL, and that must not reach a log file.
 *   3. It reads files only from the build folder, whatever the path says.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 8080);
const BUILD_DIR = resolve(fileURLToPath(new URL("../dist", import.meta.url)));

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/** Sent with every response. */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site https://fonts.googleapis.com https://fonts.gstatic.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

/**
 * The file a request path names inside the build folder, or null when the
 * path would leave it.
 */
export function resolveInBuild(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const candidate = resolve(join(BUILD_DIR, normalize(decoded)));
  if (candidate !== BUILD_DIR && !candidate.startsWith(BUILD_DIR + sep)) return null;
  return candidate;
}

async function readIfFile(path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    return await readFile(path);
  } catch {
    return null;
  }
}

function send(response, status, headers, body) {
  response.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  response.end(body);
}

const server = createServer(async (request, response) => {
  // Only the path is ever read or logged; the query string is dropped here.
  const { pathname } = new URL(request.url ?? "/", "http://localhost");

  if (pathname === "/healthz") {
    return send(response, 200, { "Content-Type": "text/plain; charset=utf-8" }, "ok");
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return send(response, 405, { Allow: "GET, HEAD" }, "Method not allowed");
  }

  const path = resolveInBuild(pathname);
  if (path === null) {
    return send(response, 400, { "Content-Type": "text/plain; charset=utf-8" }, "Bad request");
  }

  const file = path === BUILD_DIR ? null : await readIfFile(path);
  if (file !== null) {
    const hashed = pathname.startsWith("/assets/");
    return send(
      response,
      200,
      {
        "Content-Type": CONTENT_TYPES[extname(path)] ?? "application/octet-stream",
        "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
      },
      request.method === "HEAD" ? undefined : file,
    );
  }

  // A path with a file extension that isn't in the build is a real miss.
  if (extname(pathname) !== "") {
    return send(response, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not found");
  }

  // Every other path is a screen of the single-page app.
  const index = await readIfFile(join(BUILD_DIR, "index.html"));
  if (index === null) {
    return send(response, 503, { "Content-Type": "text/plain; charset=utf-8" }, "Gala is not built yet.");
  }
  return send(
    response,
    200,
    { "Content-Type": CONTENT_TYPES[".html"], "Cache-Control": "no-cache" },
    request.method === "HEAD" ? undefined : index,
  );
});

server.listen(PORT, () => {
  console.log(`Gala is listening on port ${PORT}`);
});
