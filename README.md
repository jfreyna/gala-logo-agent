Gala, a logo design agent on Fly.io Sprites. The persona prompt is withheld.

# Gala

Gala takes a person from a brief to a finished logo kit, in five steps: discovery, form and type in black and white, concepts and a stress test, color, and the kit. Every choice comes in threes, and each step waits for a sign-off before the next one opens: the typeface, then the name set in it as a wordmark, then the symbol, then the two together as a lockup, then color.

This repository holds the web app, its storage, the engine that does the work, and the kit pipeline.

## How it is put together

```
Browser ──────────────► Gala's server on a Fly.io Sprite
   │                       serves the web app
   │                       runs the engine: POST /api/turn
   │                          │
   │                          ├──► Gemini, through a Sprites connector    words, research, drawing
   │                          ├──► Jev, through a Sprites connector       every choice and every check
   │                          └──► the kit pipeline (kit/)                lock-ups, SVG, EPS, PNG, spec
   │
   ├── sign-in ───────► Frilly (accounts)                      Google, or email and password
   │
   └── data ──────────► Gala's own Convex project              projects, chat, memory, uploads, kits
                          trusts Frilly's sign-in tokens          and, in its environment, the prompt
```

- **The web app** (`src/`) is React and TypeScript, built with Vite and styled with Tailwind. The screens are a one-to-one build of the design frames: the colors, type and spacing in `tailwind.config.js` and `src/index.css` carry the design system's own names.
- **Sign-in is Frilly's.** Gala has no accounts of its own. `src/lib/auth.ts` talks to Frilly's sign-in from Gala's address, which Frilly trusts by name.
- **Storage is Gala's own Convex project** (`convex/`). `convex/auth.config.ts` trusts the tokens Frilly's sign-in issues, so no key of Frilly's is stored here or on the Sprite. Every table row carries its owner, and every function checks the caller against it (`convex/lib/owner.ts`). The one public read is the halls on the front page (`convex/halls.ts`), which returns only what a person chose to submit.
- **The server** (`server/index.mjs`) is a small Node program. It serves the built app and runs the engine under `/api`. Because Frilly trusts its address with sign-ins, it never redirects, never logs a query string or a token, and reads files only from the build folder.
- **No model key is anywhere in this project.** The two model gateways are Sprites connectors: they answer only from inside the Sprite and take no auth header.

## The engine

**Code owns the process, the model owns the words and the drawings, and Jev owns every pick from a known set.** The order of the steps, "always three", the checks, the contrast numbers and the kit are code (`engine/loop.ts`, `engine/stages/`). No model decides what happens next, so a model's reply can't skip a step or add a fourth option.

How a turn runs:

1. The person does something: sends a message, or presses a button on a card. That writes straight to storage (`convex/messages.ts`, `convex/studio.ts`), as the person, and never as Gala.
2. The page asks Gala's server for a turn (`POST /api/turn`), carrying the person's own sign-in token.
3. The server opens the turn in storage, which checks the person's token, takes a lock so a project has one turn at a time, and reads the project. The token is used for this one step and then dropped.
4. It reads the person's message once (`engine/steer.ts`): Jev answers three yes or no questions (does it pick an option on screen, go back or start over, ask for a change), the model fills in only the details, and code checks them and moves the stage. Going back puts a new card for that step in the conversation; later cards stay as history.
5. It runs the current stage, and keeps going through stages until one needs the person.
6. Everything Gala is about to say passes the prompt-protection checks, then is written to storage. The page sees it through its live queries. The browser receives Gala's replies and nothing else.

| Stage | What happens |
|---|---|
| Brief | Gala interviews; one brief card is kept up to date. A reference image the person attaches is read and acknowledged. |
| Research | One search-grounded call finds real competitors and neighbors; Gala proposes a direction and waits for approval. |
| Type | Jev picks the type classes and scores the moods that fit the brief, from Google's own tag file; code ranks every family (`engine/fonts.ts`). |
| Directions, variations | Three marks are drawn, traced to vector paths and judged. A draft that fails a check is set aside with its reason and drawn again (`engine/drafting.ts`, `engine/marks.ts`). |
| Stress test | Code renders the mark at 16px, in a circle, inverted and at poster size; Jev judges each render. |
| Color | The person picks their colors. Code lists every way to apply them, with contrast computed; the model picks three and says why, and what it says is checked against the numbers (`engine/colorways.ts`). |
| Kit, picks | The kit pipeline builds the files; quotes sent to the halls are checked before they can show. |

**Who may write what.** The engine reaches storage through a handful of HTTP routes (`convex/http.ts`). Every one needs a secret shared between the server and storage, which says the caller is Gala's server. Opening a turn also needs the person's own sign-in token, which says whose project it is: only the owner can open a turn. Inside the turn, the turn's id stands for the person. It is random, storage holds it as the project's lock, and it works only on that project and only while the lock lasts.

- Without the secret, a signed-in person could write as Gala and put an unchecked image or quote in the public halls.
- Without a turn an owner opened, the secret alone can't touch a project.
- A turn, once open, can't die halfway because a token ran out, and closing it always goes through, so a project is never left locked.

**The seam.** The engine talks to storage through one interface (`engine/store.ts`). On the server it is backed by Convex; in checks it is backed by memory, which is how a whole brief runs against the real models with no sign-in.

## What is withheld, and how it is guarded

The persona prompt, the instructions for each step and the hall rules are not in this repository and never were. `engine/standin-prompt.ts` is a short stand-in with the same sections, so the code runs from a fresh clone.

- **Where the real prompt lives:** in the environment of Gala's Convex project, split across numbered values (one value holds 8 KiB). One internal function joins them (`convex/prompt.ts`), and one route returns it to a caller holding the shared secret.
- **On the Sprite:** the server fetches it once at boot and keeps it in memory (`engine/prompt.ts`). It is never written to disk.
- **Before anything Gala says is stored or shown** (`engine/guard.ts`): the persona is told never to reveal its instructions; a code check refuses any reply that repeats a 48-character run of the prompt, ignoring case, spacing and punctuation; and Jev is asked whether the reply reveals or describes its instructions. Gala's spoken line and the rest of a card's text are judged as two texts, because a card often holds the person's own words. A reply that fails is replaced by a short decline, and the log names the check and its score, never the text. There is no list of forbidden phrases.
- **What this does not prove:** a paraphrase that Jev scores low, or a leak spread thinly across many replies, would get through.

## Where things are

| Path | What |
|---|---|
| `src/pages/` | The front page, About, Your logos, and the studio |
| `src/components/` | Shared pieces: header, footer, join card, halls, buttons, icons |
| `src/studio/` | The conversation, the prompt bar, each artifact Gala places in the chat, and the work panel |
| `src/backdrops/` | The animated backdrops: the hero's glows, the halls' horizon scene, the About ribbons |
| `src/lib/` | Sign-in, joining, color maths, theme, the small router |
| `src/dev/` | Development only: sample content and preview routes. Compiled out of production builds |
| `convex/` | Schema and functions for Gala's Convex project, and the routes the engine calls |
| `engine/` | The agent loop, its stages, the model and Jev clients, prompt protection, and the checks |
| `kit/` | The kit pipeline: a mark, a typeface and colors in; the lock-up files and spec sheet out |
| `server/` | The server that runs on the Sprite |
| `scripts/` | Deploy to the Sprite; the visual gate; the behavior checks; the backdrops' checks, measurement and recordings; the prompt loader and the history check |
| `public/backdrops/` | The hero's dot pattern |
| `docs/visual-gate/` | Each built screen beside its design frame |

## Running it

```bash
npm install
cp env.example .env.local   # then fill in the addresses
npx convex dev --once       # pushes the functions to your Convex dev deployment
npm run dev                 # http://localhost:3000
```

`npm run typecheck` checks the app, the Convex functions and the engine. `npm run build` makes the production build in `dist/`; `npm start` serves it.

The engine needs the two connectors, so it runs only on a Sprite. `./scripts/deploy-sprite.sh` builds and deploys; the server reads its settings from `/home/sprite/gala.env` (see `env.example`), a file the deploy never touches. With `sprite proxy 8080` running, the dev server passes `/api` through to the Sprite.

## The backdrops

The front page and About sit on three small scenes, built in `src/backdrops/` from the design frames: three glows behind the hero, a horizon with a ribbon and three spheres above the halls, and three ribbons on About.

- **Each piece is its own layer**, placed on a stage the size of its frame. The stage scales as one piece, so a phone shows the same composition smaller.
- **Only transform and opacity ever animate**, so the browser moves finished layers and repaints nothing. A ribbon never changes shape: a band of light slides along it, cut to its outline.
- **A glow is one CSS gradient with its blur already in the falloff.** `scripts/fit-falloffs.mjs` works that out from the frame's numbers and prints how close it is.
- **Loops pause while a scene is off the screen**, the halls play an entrance once, and the pointer moves things only on a device that has a fine one.
- **When the system asks for reduced motion, nothing moves:** the scene is the frame's own composition.

`node scripts/record-backdrops.mjs` writes a short recording of each scene.

## Checks

Each prints `N/N passed`, or `N/M, run incomplete` when a check could not run. Each file says at the top what it proves and what it does not.

| Command | What it checks | Runs |
|---|---|---|
| `npm run check:guard` | The code half of prompt protection: copies of the prompt are caught, reformatted or not; ordinary replies are not | anywhere |
| `npm run check:jev` | The Jev reply check and the halls' quote check, on leaking, harmless, offensive and personal cases | on the Sprite |
| `npm run check:walk` | The founder's first walk replayed: a brief for Gala's own logo gets its card, not the decline | on the Sprite |
| `npm run check:e2e` | One full brief, first message to kit and picks, against the real models with a scripted person | on the Sprite |
| `npm run check:held` | A request about a later step is stored for that step and the stage stays; a request for the current step is not held | on the Sprite |
| `npm run check:held-reaches` | A held request is in what its step works from when it opens: the typeface, the wordmark's case, the symbol's idea, the lockup's layout, the colors | on the Sprite |
| `npm run check:gate` | No step advances without an approval: nothing new, or praise, leaves the stage where it is; a sign-off moves it by exactly one step | on the Sprite |
| `npm run check:settings` | Case, Spacing, Layout and Space between land on the right values from varied wording, and other messages change nothing | on the Sprite |
| `npm run check:nosymbol` | A logo of the name alone happens only on an explicit ask, and then runs through color to a wordmark-only kit | on the Sprite |
| `npm run check:steps-walk` | One made-up brief from brief to kit on the dev deployment, one sign-off at a time: the wordmark, a held request coming back at the symbol opener, going back from the lockup to the symbol, the lockup | from a machine with the Convex CLI and the Sprite CLI |
| `npm run check:storage` | The storage functions as a signed-in person and as Gala's server: the turn lock, a turn's id reading and writing its own project and no other, ownership, choices, and quotes waiting for their check. `-- --aged-lock` also waits out a lock (12 minutes) | anywhere with the Convex CLI signed in to a dev deployment |
| `npm run check:routes` | The storage routes' refusals: no secret, no open turn, a forged token | on the Sprite |
| `npm run check:turn` | A whole real turn that runs with no sign-in token once it is open: the case of a turn that outlives the person's token | from a machine with the Convex CLI and the Sprite CLI |
| `npm run check:history -- <local prompt draft>` | No line of the real prompt is in any commit, as written or re-wrapped | anywhere, by whoever holds the draft |
| `node scripts/check-sprite-disk.mjs <local prompt draft>` | No line of the real prompt is in any file on the Sprite | from a machine with the Sprite CLI |
| `node scripts/smoke.mjs` | What the screens do: the join card's states, the halls, the studio's controls | with the dev server running |
| `node scripts/visual-gate.mjs <frames> docs/visual-gate` | Every screen beside its design frame | with the dev server running |
| `npm run check:backdrops -- <frames>` | The backdrops at rest against Figma's rendering, and what moves: only transform and opacity, loops paused off screen, the halls' entrance, the pointer only where there is one, nothing under reduced motion | with the dev server running |
| `npm run measure:backdrops` | Main-thread time per frame for each backdrop on a throttled phone profile, against a 2 ms budget | with the dev server running |
| `cd kit && npm run verify` | The kit's color maths and every file it writes | anywhere; the EPS checks need Ghostscript |
