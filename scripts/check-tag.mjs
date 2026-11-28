#!/usr/bin/env node
/**
 * What the Google tag sends, checked in a headless browser against the built
 * app on Gala's real server (`PORT=8081 node server/index.mjs` after
 * `npm run build`).
 *
 * The browser maps Gala's production hostname to this machine, so the tag's
 * hostname rule passes while every page still comes from the local server.
 * Every request bound for Google (other than loading gtag.js itself and the
 * fonts) is recorded, with its body, and then aborted, so no test hit ever
 * reaches the live property. A sign-in token check is answered inside the
 * test browser, so nothing reaches Frilly's sign-in backend either.
 *
 * It asserts, for addresses carrying a test sign-in token, a test email, an
 * error, a fragment and a share token, and for moves between pages in place:
 * at least one page view per case, no test value in any recorded request,
 * every page address exactly origin plus path, a referrer with no query, no
 * person id, one page view per move, the security headers, and no blocked
 * request in the console other than the two ads hosts below. A second run on
 * localhost asserts Google's script is never fetched and nothing is sent.
 *
 * Cloudflare's Web Analytics beacon, which Cloudflare's edge adds to live
 * pages, is injected here the way the live page carries it (with a dummy
 * token). The check asserts the policy lets it load, that it reports only to
 * the page's own /cdn-cgi/rum (answered here, so nothing reaches Cloudflare),
 * and that no report carries a test value. Two negative controls show the
 * policy is exact: a script from a lookalike Cloudflare host, and a post
 * straight to cloudflareinsights.com, are both refused before any request.
 *
 * What it proves: what this browser sends to Google for these addresses,
 * with this property's settings today.
 * What it does not prove: what Google does with a hit after it arrives, or
 * what happens after someone changes the property's settings in Google
 * Analytics (enhanced measurement, Google signals, data collection). It does
 * not cover pages it doesn't open, such as the studio, or what an embedded
 * frame (the front page's video) sends on its own: those requests are
 * aborted and listed, not judged. For the beacon, it covers its first report
 * after load; reports sent later (on leaving the page, or after a move in
 * place) are not waited for, and what Cloudflare does with a report is not
 * covered.
 *
 * Usage: node scripts/check-tag.mjs   (GALA_TAG_PORT defaults to 8081)
 */
import puppeteer from "puppeteer-core";

const PORT = Number(process.env.GALA_TAG_PORT ?? 8081);
const HOST = "gala.frillyconcierge.com";
const LIVE = `http://${HOST}:${PORT}`;
const LOCAL = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * The beacon as Cloudflare injected it on the live page (2026-11-27): this
 * script address, and this configuration with the site token replaced.
 */
const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js/vce701823e78c4301a35b7e07294d87301792088814092";
const BEACON_CONFIG = { version: "2024.11.0", token: "00000000000000000000000000000000", r: 1, spa: 2 };
const LOOKALIKE_SCRIPT = "https://cdn.cloudflareinsights.com/beacon.min.js";
const DIRECT_REPORT = "https://cloudflareinsights.com/cdn-cgi/rum";

const TEST_VALUES = ["TESTTOKEN123", "TESTSHARE456", "test@example.com", "test%40example.com", "ott=", "email=", "#frag"];

const results = [];
const assert = (name, pass, detail = "") => results.push({ name, pass: Boolean(pass), detail });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Google's hosts, matched by the end of the hostname. Fonts are left alone. */
const GOOGLE_HOSTS = ["google-analytics.com", "analytics.google.com", "googletagmanager.com", "google.com", "doubleclick.net", "googleadservices.com", "googlesyndication.com"];
const isGoogle = (url) => {
  const { hostname } = new URL(url);
  return GOOGLE_HOSTS.some((host) => hostname === host || hostname.endsWith("." + host));
};
const isTagLoader = (url) => {
  const { hostname, pathname } = new URL(url);
  return hostname === "www.googletagmanager.com" && pathname === "/gtag/js";
};
const isCollect = (url) => {
  const { hostname, pathname } = new URL(url);
  return pathname.endsWith("/collect") && (hostname.endsWith("google-analytics.com") || hostname.endsWith("analytics.google.com") || hostname.endsWith("googletagmanager.com"));
};

/** Every GA4 event in a collect request: the address's parameters, overridden by each line of the body. */
function eventsOf({ url, body }) {
  const shared = Object.fromEntries(new URL(url).searchParams);
  const lines = (body ?? "").split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [shared];
  return lines.map((line) => ({ ...shared, ...Object.fromEntries(new URLSearchParams(line)) }));
}

const decodeAll = (text) => {
  let out = text;
  for (let i = 0; i < 3; i++) {
    try {
      out = decodeURIComponent(out);
    } catch {
      break;
    }
  }
  return out;
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`],
});

/** Opens a page with Google's requests recorded and aborted. */
async function open(base, path) {
  const page = await browser.newPage();
  const captured = [];
  const tagLoads = [];
  const embedded = [];
  const beaconLoads = [];
  const reports = [];
  const strayCloudflare = [];
  const violations = [];
  await page.evaluateOnNewDocument(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (event) => window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to (load|connect|execute)/i.test(message.text())) violations.push(message.text());
  });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    // A sign-in token check is answered here, as a refusal, so nothing reaches the sign-in backend.
    if (url.includes("/cross-domain/one-time-token/verify")) {
      const origin = request.headers().origin ?? "*";
      const cors = { "access-control-allow-origin": origin, "access-control-allow-headers": "*", "access-control-allow-credentials": "true" };
      if (request.method() === "OPTIONS") return request.respond({ status: 204, headers: cors });
      return request.respond({ status: 401, contentType: "application/json", headers: cors, body: JSON.stringify({ code: "INVALID_TOKEN", message: "Invalid token" }) });
    }
    // Cloudflare's beacon loads for real. Its reports go to the page's own /cdn-cgi/rum, which only
    // Cloudflare's edge serves; here each one is recorded and answered with an empty 204 inside the
    // test browser, so none leaves it (an abort would do the same, but invites the beacon to retry).
    if (url.startsWith("http") && new URL(url).pathname === "/cdn-cgi/rum") {
      reports.push({ url, body: request.postData() ?? "" });
      return request.respond({ status: 204 });
    }
    if (url.startsWith("http") && new URL(url).hostname.endsWith("cloudflareinsights.com")) {
      if (url.startsWith(BEACON_SRC)) {
        beaconLoads.push(url);
        return request.continue();
      }
      strayCloudflare.push(url);
      return request.abort();
    }
    if (url.startsWith("http") && isGoogle(url)) {
      // The tag runs only in the page itself. An embedded frame (the video on the front page) makes
      // its own Google requests; they are aborted too, and listed apart, never counted as the tag's.
      if (request.frame() && request.frame() !== page.mainFrame()) {
        embedded.push(url);
        return request.abort();
      }
      if (isTagLoader(url)) {
        tagLoads.push(url);
        return request.continue();
      }
      captured.push({ url, body: request.postData() ?? "" });
      return request.abort();
    }
    request.continue();
  });
  const response = await page.goto(base + path, { waitUntil: "networkidle0" });
  return { page, response, captured, tagLoads, embedded, beaconLoads, reports, strayCloudflare, violations };
}

const pageViews = (captured) => captured.filter((hit) => isCollect(hit.url)).flatMap(eventsOf).filter((event) => event.en === "page_view");

/**
 * Waits until at least `count` page views are recorded, then 7 seconds more:
 * Google sends its own automatic page views about 5 seconds after a move, so
 * any duplicate lands inside the wait.
 */
async function settle(captured, count) {
  for (let waited = 0; waited < 15000 && pageViews(captured).length < count; waited += 250) await wait(250);
  await wait(7000);
}

function assertClean(label, captured) {
  const leaks = [];
  for (const hit of captured) {
    const text = `${hit.url}\n${hit.body}`;
    const decoded = decodeAll(text);
    for (const value of TEST_VALUES) if (text.includes(value) || decoded.includes(value)) leaks.push(value);
  }
  assert(`${label}: no test value in any of ${captured.length} recorded requests`, leaks.length === 0, [...new Set(leaks)].join(", "));
  const events = captured.filter((hit) => isCollect(hit.url)).flatMap(eventsOf);
  const badLocation = events.filter((event) => event.dl !== undefined && !/^https?:\/\/[^/?#]+\/[^?#]*$/.test(event.dl)).map((event) => event.dl);
  assert(`${label}: every page address is origin plus path`, badLocation.length === 0, badLocation.join(", "));
  const badReferrer = events.filter((event) => event.dr && (event.dr.includes("?") || event.dr.includes("#"))).map((event) => event.dr);
  assert(`${label}: no referrer carries a query or fragment`, badReferrer.length === 0, badReferrer.join(", "));
  assert(`${label}: no person id (uid) on any hit`, events.every((event) => !("uid" in event)));
}

/**
 * The two ads hosts the tag still tries with ads features opted out. The
 * policy blocks them, so the request never leaves the browser; the console
 * check allows a blocked request to exactly these hosts, and no other.
 */
const BLOCKED_ADS_HOSTS = ["stats.g.doubleclick.net", "www.google.com"];

async function assertNoViolations(label, opened) {
  const fromPage = await opened.page.evaluate(() => window.__violations);
  const all = [...opened.violations, ...fromPage];
  const hostOf = (text) => {
    const match = text.match(/https?:\/\/[^\s'"]+/);
    try {
      return match ? new URL(match[0]).hostname : "";
    } catch {
      return "";
    }
  };
  const others = all.filter((text) => !BLOCKED_ADS_HOSTS.includes(hostOf(text)));
  assert(`${label}: no blocked request in the console, other than the two ads hosts`, others.length === 0, others.join(" | "));
  const leaks = all.filter((text) => TEST_VALUES.some((value) => text.includes(value) || decodeAll(text).includes(value)));
  assert(`${label}: no test value in any blocked request either`, leaks.length === 0, leaks.join(" | "));
  const adsHosts = [...new Set(all.map(hostOf).filter((host) => BLOCKED_ADS_HOSTS.includes(host)))];
  if (adsHosts.length > 0) console.log(`[${label}] blocked by the policy, as allowed: ${adsHosts.join(", ")}`);
}

// 1. A sign-in return carrying a token, an email, an error and a fragment.
{
  const label = "token, email, error and fragment on /";
  const opened = await open(LIVE, "/?ott=TESTTOKEN123&email=test%40example.com&error=x#frag");
  assert(`${label}: the page loaded on the production hostname`, opened.page.url().startsWith(LIVE + "/"), opened.page.url());
  assert(`${label}: gtag.js loaded`, opened.tagLoads.length > 0);

  const headers = opened.response.headers();
  const csp = headers["content-security-policy"] ?? "";
  const directive = (name) => csp.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + " ")) ?? "";
  assert(`${label}: script-src adds www.googletagmanager.com`, directive("script-src").split(" ").includes("https://www.googletagmanager.com"), directive("script-src"));
  const connect = directive("connect-src").split(" ");
  assert(
    `${label}: connect-src adds the four Google Analytics sources`,
    ["https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com", "https://analytics.google.com"].every((source) => connect.includes(source)),
    directive("connect-src"),
  );
  assert(`${label}: no 'unsafe-inline' in script-src`, !directive("script-src").includes("'unsafe-inline'"));
  assert(
    `${label}: script-src adds exactly https://static.cloudflareinsights.com, with no wildcard`,
    directive("script-src").split(" ").includes("https://static.cloudflareinsights.com") && !csp.includes("*.cloudflareinsights.com"),
    directive("script-src"),
  );
  assert(`${label}: connect-src adds no Cloudflare host ('self' takes the beacon's reports)`, !directive("connect-src").includes("cloudflareinsights") && directive("connect-src").split(" ").includes("'self'"), directive("connect-src"));
  assert(`${label}: frame-ancestors 'none' kept`, directive("frame-ancestors") === "frame-ancestors 'none'");
  assert(`${label}: X-Frame-Options is still DENY`, headers["x-frame-options"] === "DENY", headers["x-frame-options"]);

  await settle(opened.captured, 1);
  const views = pageViews(opened.captured);
  assert(`${label}: at least one page view recorded`, views.length >= 1, `${views.length}`);
  assert(`${label}: exactly one page view`, views.length === 1, views.map((view) => view.dl).join(", "));
  assert(`${label}: page view address is exactly ${LIVE}/`, views.length > 0 && views.every((view) => view.dl === `${LIVE}/`), views.map((view) => view.dl).join(", "));
  assertClean(label, opened.captured);
  await assertNoViolations(label, opened);
  await opened.page.close();
  console.log(`[case 1] recorded ${opened.captured.length} Google requests from the page (${opened.embedded.length} from embedded frames, not counted); page views: ${views.map((view) => view.dl).join(", ")}`);
}

// 2. A share token on About.
{
  const label = "share token on /about";
  const opened = await open(LIVE, "/about?shareToken=TESTSHARE456");
  await settle(opened.captured, 1);
  const views = pageViews(opened.captured);
  assert(`${label}: at least one page view recorded`, views.length >= 1, `${views.length}`);
  assert(`${label}: exactly one page view`, views.length === 1, views.map((view) => view.dl).join(", "));
  assert(`${label}: page view address is exactly ${LIVE}/about`, views.length > 0 && views.every((view) => view.dl === `${LIVE}/about`), views.map((view) => view.dl).join(", "));
  assertClean(label, opened.captured);
  await assertNoViolations(label, opened);
  await opened.page.close();
  console.log(`[case 2] recorded ${opened.captured.length} Google requests from the page (${opened.embedded.length} from embedded frames, not counted); page views: ${views.map((view) => view.dl).join(", ")}`);
}

// 3. Moving from / to /about in place, then back.
{
  const label = "in-place moves / to /about and back";
  const opened = await open(LIVE, "/");
  await settle(opened.captured, 1);
  const first = pageViews(opened.captured).length;
  assert(`${label}: one page view on arrival`, first === 1, `${first}`);

  await opened.page.evaluate(() => (window.__sameDocument = true));
  await opened.page.evaluate(() => {
    const link = [...document.querySelectorAll("a")].find((element) => element.textContent.trim() === "About Gala");
    if (!link) throw new Error('No link named "About Gala"');
    link.click();
  });
  await settle(opened.captured, first + 1);
  const afterForward = pageViews(opened.captured);
  const sameDocument = await opened.page.evaluate(() => window.__sameDocument === true);
  assert(`${label}: the move to /about stayed in the same page`, sameDocument && opened.page.url() === `${LIVE}/about`, opened.page.url());
  const forward = afterForward.slice(first);
  assert(`${label}: exactly one page view for the move to /about`, forward.length === 1, forward.map((view) => view.dl).join(", "));
  assert(`${label}: it carries ${LIVE}/about, referred by ${LIVE}/`, forward.length === 1 && forward[0].dl === `${LIVE}/about` && forward[0].dr === `${LIVE}/`, forward.map((view) => `${view.dl} from ${view.dr}`).join(", "));

  await opened.page.evaluate(() => history.back());
  await settle(opened.captured, afterForward.length + 1);
  const back = pageViews(opened.captured).slice(afterForward.length);
  assert(`${label}: exactly one page view for the step back`, back.length === 1, back.map((view) => view.dl).join(", "));
  assert(`${label}: it carries ${LIVE}/, referred by ${LIVE}/about`, back.length === 1 && back[0].dl === `${LIVE}/` && back[0].dr === `${LIVE}/about`, back.map((view) => `${view.dl} from ${view.dr}`).join(", "));
  assertClean(label, opened.captured);
  await assertNoViolations(label, opened);
  await opened.page.close();
  console.log(`[case 3] recorded ${opened.captured.length} Google requests from the page (${opened.embedded.length} from embedded frames, not counted); page views: ${pageViews(opened.captured).map((view) => view.dl).join(", ")}`);
}

// 5. Cloudflare's beacon, as Cloudflare's edge adds it to the live page, on both token addresses.
const BEACON_CASES = [
  ["/?ott=TESTTOKEN123&email=test%40example.com&error=x#frag", "/"],
  ["/about?shareToken=TESTSHARE456", "/about"],
];
for (const [index, [path, expectedPath]] of BEACON_CASES.entries()) {
  const label = `Cloudflare beacon on ${path.split("?")[0]} with test values`;
  const opened = await open(LIVE, path);
  await opened.page.evaluate(
    (src, config) => {
      const script = document.createElement("script");
      script.type = "module";
      script.src = src;
      script.crossOrigin = "anonymous";
      script.setAttribute("data-cf-beacon", JSON.stringify(config));
      document.body.appendChild(script);
    },
    BEACON_SRC,
    BEACON_CONFIG,
  );
  for (let waited = 0; waited < 15000 && opened.reports.length === 0; waited += 250) await wait(250);
  assert(`${label}: the policy lets the beacon load and report`, opened.beaconLoads.length > 0 && opened.reports.length > 0, `${opened.beaconLoads.length} loads, ${opened.reports.length} reports`);
  assert(
    `${label}: every report goes to the page's own ${LIVE}/cdn-cgi/rum`,
    opened.reports.length > 0 && opened.reports.every((report) => new URL(report.url).origin === LIVE),
    opened.reports.map((report) => report.url).join(", "),
  );
  const locations = opened.reports.map((report) => {
    try {
      return JSON.parse(report.body).location;
    } catch {
      return undefined;
    }
  });
  assert(`${label}: each report's location is exactly ${LIVE}${expectedPath}`, locations.length > 0 && locations.every((location) => location === `${LIVE}${expectedPath}`), locations.join(", "));
  const leaks = opened.reports.filter((report) => TEST_VALUES.some((value) => `${report.url}${report.body}`.includes(value) || decodeAll(`${report.url}${report.body}`).includes(value)));
  assert(`${label}: no test value anywhere in ${opened.reports.length} report(s), address or body`, leaks.length === 0, leaks.map((report) => report.body.slice(0, 200)).join(" | "));

  // Negative controls, once: hosts the policy must refuse, before any request is made.
  let controls = [];
  if (index === 0) {
    const before = await opened.page.evaluate(() => window.__violations.length);
    await opened.page.evaluate(
      (lookalike, direct) => {
        const script = document.createElement("script");
        script.src = lookalike;
        document.body.appendChild(script);
        fetch(direct, { method: "POST", body: "{}" }).catch(() => {});
      },
      LOOKALIKE_SCRIPT,
      DIRECT_REPORT,
    );
    await wait(1500);
    controls = (await opened.page.evaluate(() => window.__violations)).slice(before);
    assert(
      `${label}: negative control, a script from cdn.cloudflareinsights.com is refused by script-src`,
      controls.some((text) => /^script-src/.test(text) && text.includes(LOOKALIKE_SCRIPT)) && !opened.strayCloudflare.some((url) => url.startsWith(LOOKALIKE_SCRIPT)),
      controls.join(" | "),
    );
    assert(
      `${label}: negative control, a post straight to cloudflareinsights.com is refused by connect-src`,
      controls.some((text) => /^connect-src/.test(text) && text.includes(DIRECT_REPORT)) && !opened.strayCloudflare.some((url) => url.startsWith(DIRECT_REPORT)),
      controls.join(" | "),
    );
  }
  await opened.page.close();
  console.log(`[case 5, ${path}] beacon loaded ${opened.beaconLoads.length} time(s); ${opened.reports.length} report(s) to ${[...new Set(opened.reports.map((report) => new URL(report.url).origin + new URL(report.url).pathname))].join(", ")}; report location(s): ${locations.join(", ")}${index === 0 ? `; controls refused: ${controls.length}` : ""}`);
}

// 4. Any other host sends nothing.
{
  const label = "localhost";
  const opened = await open(LOCAL, "/?ott=TESTTOKEN123&email=test%40example.com#frag");
  await opened.page.evaluate(() => {
    const link = [...document.querySelectorAll("a")].find((element) => element.textContent.trim() === "About Gala");
    if (link) link.click();
  });
  await wait(6000);
  assert(`${label}: gtag.js is never fetched`, opened.tagLoads.length === 0, opened.tagLoads.join(", "));
  assert(`${label}: zero Google requests recorded`, opened.captured.length === 0, opened.captured.map((hit) => hit.url).join(", "));
  // gtag.js makes its own empty queue when it loads; the tag file queues nothing on this host.
  assert(`${label}: the tag queued nothing (no config command)`, await opened.page.evaluate(() => !(window.dataLayer ?? []).some((entry) => entry && entry[0] === "config")));
  await opened.page.close();
  console.log(`[case 4] recorded ${opened.captured.length} Google requests from the page (${opened.embedded.length} from embedded frames, not counted); gtag.js fetched ${opened.tagLoads.length} time(s)`);
}

await browser.close();

// Each case's assertions are written out above; this is their total, so a run that stops early says so.
const EXPECTED = 18 + 9 + 12 + (4 + 2 + 4) + 3;
for (const result of results) console.log(`${result.pass ? "PASS" : "FAIL"}  ${result.name}${result.pass || !result.detail ? "" : `  (${result.detail})`}`);
const passed = results.filter((result) => result.pass).length;
if (results.length !== EXPECTED) {
  console.log(`\n${passed}/${EXPECTED}, run incomplete (${results.length} assertions ran)`);
  process.exit(1);
}
console.log(`\n${passed}/${EXPECTED} passed`);
process.exit(passed === EXPECTED ? 0 : 1);
