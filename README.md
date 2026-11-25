Gala, a logo design agent on Fly.io Sprites. The persona prompt is withheld.

# Gala

Gala takes a person from a brief to a finished logo kit, in five steps: discovery, form and type in black and white, concepts and a stress test, color, and the kit. Every choice comes in threes.

This repository holds the web app and its storage. The agent's engine lands in a later change.

## How it is put together

```
Browser ──────────────► Gala's server on a Fly.io Sprite     serves the built web app
   │
   ├── sign-in ───────► Frilly (accounts)                    Google, or email and password
   │
   └── data ──────────► Gala's own Convex project            projects, chat, memory, uploads, kits
                          trusts Frilly's sign-in tokens
```

- **The web app** (`src/`) is React and TypeScript, built with Vite and styled with Tailwind. The screens are a one-to-one build of the design frames: the colors, type and spacing in `tailwind.config.js` and `src/index.css` carry the design system's own names.
- **Sign-in is Frilly's.** Gala has no accounts of its own. `src/lib/auth.ts` talks to Frilly's sign-in from Gala's address, which Frilly trusts by name.
- **Storage is Gala's own Convex project** (`convex/`). `convex/auth.config.ts` trusts the tokens Frilly's sign-in issues, so no key of Frilly's is stored here or on the Sprite. Every table row carries its owner, and every function checks the caller against it (`convex/lib/owner.ts`). The one public read is the halls on the front page (`convex/halls.ts`), which returns only what a person chose to submit.
- **The server** (`server/index.mjs`) is a small Node program with no dependencies. It serves the built app. Because Frilly trusts its address with sign-ins, it never redirects, never logs a query string, and reads files only from the build folder.

## Where things are

| Path | What |
|---|---|
| `src/pages/` | The front page, About, Your logos, and the studio |
| `src/components/` | Shared pieces: header, footer, join card, halls, buttons, icons |
| `src/studio/` | The conversation, the prompt bar, each artifact Gala places in the chat, and the work panel |
| `src/lib/` | Sign-in, joining, color maths, theme, the small router |
| `src/dev/` | Development only: sample content and preview routes. Compiled out of production builds |
| `convex/` | Schema and functions for Gala's Convex project |
| `server/` | The server that runs on the Sprite |
| `scripts/` | Deploy to the Sprite; the visual gate |
| `public/backdrops/` | The page backdrops, one file per backdrop and mode |
| `docs/visual-gate/` | Each built screen beside its design frame |

## Running it

```bash
npm install
cp env.example .env.local   # then fill in the three addresses
npx convex dev --once       # pushes the functions to your Convex dev deployment
npm run dev                 # http://localhost:3000
```

`npm run typecheck` checks the app and the Convex functions. `npm run build` makes the production build in `dist/`; `npm start` serves it.

## Checks

- **Visual gate:** `node scripts/visual-gate.mjs <folder of frame PNGs> docs/visual-gate` puts every screen beside its design frame and counts differing pixels. It needs the dev server running and the frames exported from the design file at their own size. Results and what the gate does and does not prove are in `docs/visual-gate/README.md`.

## What is withheld

The persona prompt, the phase instructions and the hall rules are not in this repository and never were. `.gitignore` covers local drafts.
