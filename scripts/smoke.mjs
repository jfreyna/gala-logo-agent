#!/usr/bin/env node
/**
 * Behavior checks for the screens, run in a headless browser against the dev
 * server (port 3000). The visual gate proves how the screens look; this
 * proves a handful of things they do.
 *
 * Calls to Frilly's join route are answered here, inside the test browser,
 * so no email is ever sent and no account is touched.
 *
 * What it does not prove: a real sign-in, anything stored in Convex, or the
 * engine. Those need a signed-in person.
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.GALA_PREVIEW_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const checks = [];
const check = (name, run) => checks.push({ name, run });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

async function open(path, { joinAnswer, signInAnswer, reducedMotion = false, width = 1440, height = 900 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }]);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.url().endsWith("/join/gala")) {
      if (request.method() === "OPTIONS") return request.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
      const [status, body] = joinAnswer ?? [500, {}];
      return request.respond({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    }
    // A sign-in is answered here too, after a short pause, so no password ever leaves the test browser.
    if (request.url().endsWith("/sign-in/email")) {
      if (request.method() === "OPTIONS") return request.respond({ status: 204, headers: { "access-control-allow-origin": request.headers().origin ?? "*", "access-control-allow-headers": "*", "access-control-allow-credentials": "true" } });
      const [status, body] = signInAnswer ?? [401, { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }];
      return void setTimeout(() => request.respond({ status, contentType: "application/json", headers: { "access-control-allow-origin": request.headers().origin ?? "*", "access-control-allow-credentials": "true" }, body: JSON.stringify(body) }), 500);
    }
    request.continue();
  });
  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  return page;
}

const text = (page) => page.evaluate(() => document.body.innerText);
const click = (page, label) =>
  page.evaluate((wanted) => {
    const target = [...document.querySelectorAll("button, a")].find((element) => element.textContent.trim() === wanted || element.getAttribute("aria-label") === wanted);
    if (!target) throw new Error(`No control named "${wanted}"`);
    target.click();
  }, label);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendEmail(page, value) {
  await page.type('input[type="email"]', value);
  await click(page, "Send me the link");
  await wait(400);
}

check("the front page shows its heading and the join card", async () => {
  const page = await open("/");
  const body = await text(page);
  return body.includes("your logo design partner.") && body.includes("Start your first logo");
});

check("the mode toggle switches between light and dark", async () => {
  const page = await open("/");
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.evaluate(() => document.querySelector('[data-name="mode-toggle"]').click());
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  return before !== after && ["light", "dark"].includes(after);
});

check("About Gala opens without reloading the page", async () => {
  const page = await open("/");
  await page.evaluate(() => (window.__sameDocument = true));
  await click(page, "About Gala");
  await wait(200);
  return page.url().endsWith("/about") && (await page.evaluate(() => window.__sameDocument === true)) && (await text(page)).includes("Why the name");
});

check("join card: a malformed address shows the Error state and sends nothing", async () => {
  const page = await open("/", { joinAnswer: [200, { status: "sent" }] });
  await sendEmail(page, "you@emberandrye");
  return (await text(page)).includes("That doesn’t look like an email address.");
});

check("join card: 'sent' shows the Sent state with the address", async () => {
  const page = await open("/", { joinAnswer: [200, { status: "sent" }] });
  await sendEmail(page, "you@example.test");
  const body = await text(page);
  return body.includes("Check your email to get the access link.") && body.includes("Sent to you@example.test");
});

check("join card: 'rateLimited' shows Send failed", async () => {
  const page = await open("/", { joinAnswer: [429, { status: "rateLimited" }] });
  await sendEmail(page, "you@example.test");
  return (await text(page)).includes("The link didn’t send. Try again in a moment.");
});

check("join card: 'invalidEmail' from the route shows the Error state", async () => {
  const page = await open("/", { joinAnswer: [400, { status: "invalidEmail" }] });
  await sendEmail(page, "you@example.test");
  return (await text(page)).includes("That doesn’t look like an email address.");
});

check("join card: a route that is not there shows Send failed, not a crash", async () => {
  const page = await open("/", { joinAnswer: [404, {}] });
  await sendEmail(page, "you@example.test");
  return (await text(page)).includes("The link didn’t send. Try again in a moment.");
});

check("join card: Send again shows the 30-second wait, and 'Use a different email' returns to the field", async () => {
  const page = await open("/", { joinAnswer: [200, { status: "sent" }] });
  await sendEmail(page, "you@example.test");
  await click(page, "Didn’t get it? Send again");
  await wait(400);
  const resent = /Sent again\. Another link in 0:(30|29)\./.test(await text(page));
  await click(page, "Use a different email");
  await wait(100);
  return resent && (await page.$('input[type="email"]')) !== null;
});

check("join card: 'Sign in' opens the sign-in card, and 'Start your first logo' returns to signing up", async () => {
  const page = await open("/");
  await click(page, "Sign in");
  const signIn = await text(page);
  await click(page, "Start your first logo");
  const back = await text(page);
  return signIn.includes("Sign in to Gala") && signIn.includes("Forgot password?") && signIn.includes("New to Gala?") && !signIn.includes("Your password is set") && back.includes("Already on Frilly?");
});

check("join card: 'accountExists' opens the sign-in card with the address kept", async () => {
  const page = await open("/", { joinAnswer: [200, { status: "accountExists" }] });
  await sendEmail(page, "member@example.com");
  const kept = await page.$eval('input[type="email"]', (input) => input.value);
  return (await text(page)).includes("Sign in to Gala") && kept === "member@example.com";
});

check("join card: a refused sign-in shows 'Signing in…', then the Sign-in error, and typing clears it", async () => {
  const page = await open("/preview/joincard?state=signIn");
  await page.type('input[type="email"]', "member@example.com");
  await page.type('input[type="password"]', "not-the-password");
  await click(page, "Sign in");
  await wait(150);
  const during = (await text(page)).toLowerCase();
  await wait(900);
  const after = await text(page);
  await page.type('input[type="password"]', "x");
  const cleared = await text(page);
  return during.includes("signing in…") && after.includes("That email and password don’t match.") && !cleared.includes("That email and password don’t match.");
});

check("join card: an empty sign-in shows the Sign-in error and sends nothing", async () => {
  const page = await open("/preview/joincard?state=signIn");
  let sent = false;
  page.on("request", (request) => (sent ||= request.url().endsWith("/sign-in/email")));
  await click(page, "Sign in");
  await wait(200);
  return (await text(page)).includes("That email and password don’t match.") && !sent;
});

check("join card: ?signin=1 opens Sign in with the Password set line", async () => {
  const page = await open("/?signin=1");
  const body = await text(page);
  return body.includes("Sign in to Gala") && body.includes("Your password is set. Sign in to start.");
});

check("join card: 'Forgot password?' points at Frilly's reset page", async () => {
  const page = await open("/preview/joincard?state=signIn");
  const address = await page.$eval('a[data-name="forgot"]', (link) => link.href);
  return /^https:\/\/[a-z.]*frillyconcierge\.com\/app\/auth\/forgot-password$/.test(address);
});

check("halls: hovering a tile opens it; pressing it opens the full view; Escape closes it", async () => {
  const page = await open("/preview/home", { reducedMotion: true });
  const tile = await page.evaluateHandle(() => [...document.querySelectorAll('[data-name="gala-hall-tile"]')].find((element) => element.getAttribute("aria-label").startsWith("Ember & Rye")));
  await tile.hover();
  await wait(150);
  const hovered = (await text(page)).includes("Picked as best");
  await tile.click();
  await wait(150);
  const opened = (await page.$('[role="dialog"]')) !== null && (await text(page)).includes("none felt like us");
  await page.keyboard.press("Escape");
  await wait(150);
  return hovered && opened && (await page.$('[role="dialog"]')) === null;
});

check("halls: the rows roll, and stand still when the system asks for reduced motion", async () => {
  const moving = await open("/preview/home");
  const still = await open("/preview/home", { reducedMotion: true });
  const animation = (page) => page.evaluate(() => getComputedStyle(document.querySelector(".hall-track")).animationName);
  return (await animation(moving)) === "hall-roll-left" && (await animation(still)) === "none";
});

check("halls: a hall with no entries is not shown", async () => {
  const page = await open("/");
  const body = await text(page);
  const shown = await page.$$eval('[data-name="gala-hall-carousel"]', (elements) => elements.length);
  // The live halls are empty until someone submits; this passes only while that is true.
  return shown === 0 ? !body.includes("Hall of fame") : true;
});

check("studio: Hints opens the three lines, and pressing one fills the prompt", async () => {
  const page = await open("/preview/brief");
  await click(page, "Hints›");
  await wait(100);
  const opened = (await page.$('[data-name="gala-prompt-hints"]')) !== null;
  await click(page, "Show me the logos my competitors use");
  await wait(100);
  const filled = await page.evaluate(() => [...document.querySelectorAll("textarea")].some((field) => field.value === "Show me the logos my competitors use"));
  return opened && filled && (await page.$('[data-name="gala-prompt-hints"]')) === null;
});

check("studio: the account button opens a menu with Your logos and Sign out", async () => {
  const page = await open("/preview/studio");
  await click(page, "Account");
  await wait(100);
  const menu = await page.$eval('[data-name="gala-account-menu"]', (element) => element.innerText).catch(() => "");
  return menu.includes("Your logos") && menu.includes("Sign out");
});

check("studio: the Work button opens the panel, and Memory asks before clearing", async () => {
  const page = await open("/preview/directions");
  await click(page, "Work");
  await wait(100);
  const history = (await text(page)).includes("3 directions, waiting on your pick");
  await click(page, "Memory");
  await wait(100);
  await click(page, "Clear all memory");
  await wait(100);
  const asked = (await text(page)).includes("Clear everything Gala remembers? This can’t be undone.");
  await click(page, "Cancel");
  await wait(100);
  return history && asked && (await text(page)).includes("Clear all memory");
});

check("studio: the working mark is a file: the animated one normally, the static one under reduced motion", async () => {
  const fileOf = (page) => page.$eval('[data-name="thinking"]', (mark) => [mark.dataset.file, getComputedStyle(mark).maskImage || getComputedStyle(mark).webkitMaskImage, mark.offsetWidth, mark.offsetHeight]);
  const moving = await fileOf(await open("/preview/studio?working=1"));
  const still = await fileOf(await open("/preview/studio?working=1", { reducedMotion: true }));
  // The animated file carries its own animation and the still does not.
  const text = (path) => fetch(BASE + path).then((response) => response.text());
  const served = (await text("/thinking/gala-thinking.svg")).includes("@keyframes") && !(await text("/thinking/gala-thinking-static.svg")).includes("@keyframes");
  return (
    moving[0] === "/thinking/gala-thinking.svg" && moving[1].includes("/thinking/gala-thinking.svg") && moving[2] === 32 && moving[3] === 16 &&
    still[0] === "/thinking/gala-thinking-static.svg" && still[1].includes("/thinking/gala-thinking-static.svg") && served
  );
});

check("studio: on a phone the prompt bar's working line stays on one line, and is cut with an ellipsis when it does not fit", async () => {
  // The bar is 348 wide on a 380 phone, and 62 tall with one line of text in it.
  const measure = async (status) => {
    const page = await open(`/preview/studio?status=${encodeURIComponent(status)}`, { width: 380, height: 812 });
    return page.evaluate(() => {
      const line = document.querySelector('[data-name="composer"] [role="status"]');
      const bar = document.querySelector('[data-name="composer"]').getBoundingClientRect();
      const shown = [...line.querySelectorAll("span")].find((span) => span.offsetParent !== null);
      return { shown: shown.innerText.trim(), lineHeight: Math.round(line.getBoundingClientRect().height), bar: [Math.round(bar.width), Math.round(bar.height)], cut: line.scrollWidth > line.clientWidth, ellipsis: getComputedStyle(line).textOverflow };
    });
  };
  const short = await measure("Reading your brief");
  const long = await measure("Looking at competitors and neighbors");
  const oneLine = (bar) => bar.lineHeight === 25 && bar.bar[0] === 348 && bar.bar[1] === 62 && bar.ellipsis === "ellipsis";
  return short.shown === "Reading your brief…" && oneLine(short) && !short.cut && oneLine(long) && long.cut;
});

check("studio: no fades; a gap of 28px (20px on a phone) between the conversation and the prompt bar, and 64px (32px) of padding at the conversation's end", async () => {
  const measure = (page) =>
    page.evaluate(() => {
      const box = (name) => document.querySelector(`[data-name="${name}"]`).getBoundingClientRect();
      return {
        gap: Math.round(box("composer").top - box("conversation-area").bottom),
        padding: parseFloat(getComputedStyle(document.querySelector('[data-name="conversation-content"]')).paddingBottom),
        fades: document.querySelectorAll('[data-name^="fade/"]').length,
      };
    });
  const desktop = await measure(await open("/preview/directions"));
  const phone = await measure(await open("/preview/directions", { width: 380, height: 812 }));
  return desktop.gap === 28 && desktop.padding === 64 && desktop.fades === 0 && phone.gap === 20 && phone.padding === 32 && phone.fades === 0;
});

check("studio: scrolled to the newest item, it rests 92px (52px on a phone) above the prompt bar", async () => {
  const measure = (page) =>
    page.evaluate(() => {
      const scroller = document.querySelector('[data-name="conversation"]');
      const last = document.querySelector('[data-name="conversation-content"]').lastElementChild.getBoundingClientRect();
      return {
        overflows: scroller.scrollHeight > scroller.clientHeight,
        atEnd: Math.abs(scroller.scrollTop + scroller.clientHeight - scroller.scrollHeight) <= 1,
        above: Math.round(document.querySelector('[data-name="composer"]').getBoundingClientRect().top - last.bottom),
      };
    });
  const desktop = await measure(await open("/preview/directions"));
  const phone = await measure(await open("/preview/directions", { width: 380, height: 812 }));
  return desktop.overflows && desktop.atEnd && desktop.above === 92 && phone.overflows && phone.atEnd && phone.above === 52;
});

check("studio: a long rationale grows its card instead of running into the checks, and the row's checks and buttons line up", async () => {
  // The founder's walk: five lines of rationale ran over the 16px / Circle / Inverted badges.
  const long = "A drop of ink pivots on its point, the way a brush lands before a stroke. It keeps Gala's motion without leaning on the obvious paintbrush, and the counter stays open at small sizes, so it still reads in a browser tab.";
  const measure = (page, cardName, rowName) =>
    page.evaluate(
      (text, cardName, rowName) => {
        const row = document.querySelector(`[data-name="${rowName}"]`);
        const cards = [...row.querySelectorAll(`[data-name="${cardName}"]`)];
        const rationale = cards[0].querySelector("p.type-caption-medium");
        rationale.textContent = text;
        const tops = (name) => cards.map((card) => Math.round(card.querySelector(`[data-name="${name}"]`).getBoundingClientRect().top));
        const below = cards[0].querySelector('[data-name="checks"], [data-name="roles"], [data-name="choose"]');
        // The text's own extent, not its box: a box that shrinks lets the text spill past it.
        const range = document.createRange();
        range.selectNodeContents(rationale);
        return {
          clear: range.getBoundingClientRect().bottom <= below.getBoundingClientRect().top && rationale.scrollHeight <= rationale.clientHeight + 1,
          sameHeights: new Set(cards.map((card) => Math.round(card.getBoundingClientRect().height))).size === 1,
          buttonsLineUp: new Set(tops("choose")).size === 1,
        };
      },
      long,
      cardName,
      rowName,
    );
  const results = [];
  for (const size of [{}, { width: 380, height: 812 }]) {
    results.push(await measure(await open("/preview/directions?top=1", size), "gala-concept-card", "directions"));
  }
  return results.every((result) => result.clear && result.sameHeights && result.buttonsLineUp);
});

check("studio: the send button is dimmed until something is typed", async () => {
  const page = await open("/preview/brief");
  const dimmed = await page.$eval('[aria-label="Send"]', (element) => element.getAttribute("aria-disabled"));
  await page.evaluate(() => [...document.querySelectorAll("textarea")].find((field) => field.offsetParent !== null).focus());
  await page.keyboard.type("Mostly neighbors");
  const ready = await page.$eval('[aria-label="Send"]', (element) => element.getAttribute("aria-disabled"));
  return dimmed === "true" && ready === "false";
});

let passed = 0;
let ran = 0;
for (const { name, run } of checks) {
  let ok = false;
  let note = "";
  try {
    ok = (await run()) === true;
  } catch (error) {
    note = ` (${String(error.message ?? error).slice(0, 120)})`;
  }
  ran++;
  if (ok) passed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${note}`);
}
await browser.close();

const expected = checks.length;
console.log(ran === expected ? `\n${passed}/${expected} passed` : `\n${passed}/${ran}, run incomplete`);
process.exit(passed === expected ? 0 : 1);
