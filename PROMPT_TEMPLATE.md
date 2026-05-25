I want to build a small web app. Use the stack, conventions, and
workflow rules below. If anything doesn't fit, flag it before deviating.

## Stack
- **Frontend**: React 19 + Vite + TypeScript.
- **Styling**: Tailwind CSS v4 with the `@theme` directive for custom
  tokens. No hand-written CSS files for design — only tokens and a base
  reset in `src/index.css`.
- **Typography**: Google Fonts loaded via `<link>` in `index.html`.
  Default pair: Cormorant Garamond (display) + Inter (body), defined as
  `--font-display` and `--font-sans` in the `@theme` block.
- **Routing**: `react-router-dom` v7.
- **Backend**: a single `apps-script/Code.gs` deployed as a Google Apps
  Script Web App, container-bound to a Google Sheet. Access: Anyone,
  Execute as: Me.
- **Storage**: Google Sheets, one tab per data model, headers ensured
  idempotently.
- **Hosting**: GitHub Pages, with a workflow that builds with
  `BASE_PATH` and copies `dist/index.html` to `dist/404.html` for SPA
  fallback.
- **No Google Cloud / OAuth Client / Consent Screen** unless I
  explicitly ask. Admin auth is a passphrase stored in Script
  Properties.

## Backend (Apps Script)
- A single `Code.gs`. Router pattern: `doGet`/`doPost` call `route_`,
  which dispatches via a `HANDLERS_` map keyed by an `action` param.
- POST handlers parse JSON from `e.postData.contents`. GET handlers
  read `e.parameter`.
- All responses are JSON via `ContentService.createTextOutput`.
- **CORS**: clients POST with `Content-Type: text/plain;charset=utf-8`
  (sidesteps preflight). The script parses JSON from the body.
- Secrets via `PropertiesService.getScriptProperties()`. The user adds
  them manually in ⚙ Project Settings → Script Properties.
- Caching (tokens, etc.) via `CacheService.getScriptCache()`.
- All writes wrapped in `withWriteLock_` (LockService.tryLock).
- Validation helpers: `requireString_(params, key)` and
  `requireInt_(params, key, min, max)`.
- `setup()` creates/migrates sheets idempotently and is called at the
  top of every request — never rely on the user "running setup once".
- New IDs: `Utilities.getUuid()` server-side. **Never** a manual id
  field in any form.
- `ensureSheetWithHeaders_` is race-safe: try/catch `insertSheet`,
  fall back to re-getting.

## API client
- `src/api/client.ts`: single wrapper with `getJson(payload)` and
  `postJson(payload)`. Throws if the response contains `error`. POST
  uses `text/plain;charset=utf-8`.
- One typed module per domain: `src/api/<resource>.ts` exporting typed
  functions.
- Admin auth: `src/auth/passphrase.ts` with `load`/`save`/`clear`
  helpers over localStorage. Admin pages send the passphrase as `auth`
  on every request.

## Code style
- **All code identifiers in English** — types, variables, functions,
  filenames, comments, commit messages. UI strings stay in the user's
  language.
- Default to no comments. Only when the WHY isn't obvious from the
  code itself.
- PascalCase for components, camelCase for fns/vars.
- Build and lint must be clean: `npm run build && npm run lint`.

## Design
- **Visual polish is a first-class deliverable**, not "v1 ugly, polish
  later". Real typography, hero with imagery or layered gradient,
  multiple sections with breathing room, considered details.
- Tokens via Tailwind `@theme` with namespaced names like
  `--color-ivory`, `--color-ink`, `--color-gold`. No hex colors hardcoded
  in JSX.
- Mobile-first responsive; use `clamp()` for fluid type.
- Modals: native `<dialog>` element with `showModal()` and Tailwind's
  `backdrop:` variant for the backdrop.
- Status pills, busy overlays, polished tables, consistent spacing.

## Project bootstrap (when starting fresh)
1. `npm create vite@latest -- --template react-ts`
2. `npm i tailwindcss @tailwindcss/vite react-router-dom`
3. `vite.config.ts`: add `tailwindcss()` plugin and
   `base = process.env.BASE_PATH ?? "/<repo>/"`.
4. `src/index.css`: `@import "tailwindcss"` + an `@theme {…}` block
   with colors and fonts.
5. `apps-script/Code.gs`: router + setup + handlers + helpers, using
   all the conventions above.
6. `.github/workflows/deploy.yml`: build with `BASE_PATH`, copy
   `dist/index.html` → `dist/404.html`, then `upload-pages-artifact`
   + `deploy-pages`.
7. README: how to paste `Code.gs` into the Sheet's Apps Script editor,
   set Script Properties, deploy as Web App, paste the URL into
   `src/config.ts`.

## How I work with you
- Take initiative — decide and execute instead of offering a menu when
  you can pick yourself.
- Batch tool calls.
- No screenshots or previews unless I ask. The bar for "done" is
  `npm run build && npm run lint` passing clean.
- Don't narrate intermediate steps — a short summary at the end is
  enough.

Tell me what app you want to build and we'll start.
