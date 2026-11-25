# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` — Vite dev server on :8009, proxying `/api/*` to a local TrailBase on :4000 (`SOCCER_API` to change it).
- `npm run server` — production build into `./server/public`, served by `vite preview`.
- `npm run start:full` — runs `start`, `server`, and `make -C ../ImageBase dev` (TrailBase backend) concurrently.
- `./server/start.sh [--rebuild]` — production-shaped local harness: builds into `./server/public`, starts TrailBase on :4000, and runs a tiny Node static + reverse proxy on :8009.
- `npm run build` — production build into `./deploy`.
- `npm run check` — `tsc --noEmit` typecheck of `src/`, then of `e2e/` (its own `e2e/tsconfig.json`).
- `npm test` — runs every `src/**/*.test.ts` via `tsx --test`. Single test: `tsx --test src/web/pages/match/state-logic.test.ts`.
- `npm run fmt` / `fmt:check` — format with oxfmt.
- `npm run e2e` — Playwright end-to-end tests (`e2e/*.spec.ts`) against the real app in Chromium. Starts its own throwaway TrailBase on :4010 (fresh depot in `e2e/.depot`, seeded from `../ImageBase`, which must be on a branch with the features under test) and Vite on :8010, so it can run beside `npm start`. Needs `trail`, `sqlite3`, and the Rust toolchain for the ImageBase guest wasm. Single test: `npx playwright test -g "removing a coach"`. Each test registers fresh users through the API and marks them verified in SQL (`trail user add` fails on TrailBase v0.35); the `Coach` fixture in `e2e/fixtures.ts` is one logged-in device, with background auto-sync off (call `coach.sync()`). `coach.tap(action, ...)` taps and waits for that page action to finish (`app:done`). `MatchPage` in `e2e/match-page.ts` drives the match play view by tapping like a coach does (`lineup`, `start`, `goal`, `queue` + `swapAll` / `swapOne`, `move`, `toBench`, `end`); `setTeamStat` flips basketball mode or the Goal stat.

- `tasks/check-contrast.sh [shots-dir]` — `e2e/contrast.spec.ts`: every page, light and dark, must meet WCAG AAA contrast (text 7:1, large text 4.5:1, field edges 3:1); with a directory, also saves grayscale screenshots. The app must also read with a phone's grayscale filter on, so states differ by lightness, fill or border, not hue alone. Colors go through the tokens at the top of `src/web/css/app.css`.

- `npm run build:native` / `install:native` / `test:native` — the native desktop and Android client in `native/`, written in V (`make -C native android` for the APK). See `native/README.md`.
- `tasks/measure-startup.sh` / `tasks/measure-speed.sh` — time the web and native apps on the connected phone: startup, and taps during a match and moving between pages (`e2e/phone/speed.perf.ts`, Playwright driving the phone's Chrome against a production build on a localhost site of its own, the real site only read). Results and what they mean: `docs/startup-and-size.html`.
- `tasks/*.sh` — one script per command the user runs by hand (setup, building and installing the APK, the emulator, phone logs, tests). When telling the user to run a command they will want again, add or update a script here.

The `/api` path is owned by TrailBase (separate repo at `../ImageBase`). The Vite dev server and NGINX in production both forward `/api/*` there.

## Architecture

This is an **offline-first PWA** whose pages render **in the browser**, from IndexedDB. There is no web server for the app: TrailBase is only a sync target.

### The app shell and its pages

- `src/web/index.html` is the app shell: the header, `<main id=main data-root>`, the toasts, and `src/web/app/main.ts`. Every page of the app (`/web/teams`, `/web/match?teamId=1&gameId=2`, ...) is this one document: the service worker, the Vite dev server (`vite.config.ts`) and NGINX all answer them with the shell.
- `src/web/app/router.ts` maps each path to a page module, loaded with `import()` the first time it's opened. It renders the module into `<main>` and draws the header (`app/layout.ts`). Links to app pages, back/forward and `navigate()` render in place with `history.pushState`; `refresh()` draws the current page again (after a sync brings new data).
- A page module (`src/web/pages/*.page.ts`) exports `default { render({ query, url }), actions }` (`app/page.ts`). `render` returns `{ title, main, nav?, bare? }`; `bare` drops the header (the match play view).
- HTML is rendered with tagged-template-literal streams from `html-template-tag-stream`, joined into a string (`app/dom.ts` `text()`).
- **Actions** (`app/action.ts`, after `~/r/timer/src/_action`): the markup names them, `_click=swap`, `_change=editTeam`, `_submit="addPlayer reset"`, `_load=gameTimer`. The dispatcher looks the name up on the element's `app`, then the nearest `[data-root]`'s (the router puts the page's `actions` on `<main>`), then `window.app` (global actions in `app/main.ts`: `confirm`, `reset`, `theme`, `syncNow`, `redirect`). An action gets `{ ev, el, form, submitter, query, data }`: `query` is the page's URL params plus the `data-*` of the element and its form (strings, for the validators in `data/validators.ts`), `data` is the form's fields. Actions run **one at a time, in order** (so a record read and saved by one isn't read by the next mid-way); `immediate()` ones (like `confirm`) run as the event fires and can stop it. A returned string or list is toasted; a rejected string or list (what the validators reject with) is toasted too. Each finished action fires `app:done` on `document` (the e2e tests wait on it). `_load` actions return `{ disconnectedCallback }` to clean up when their element leaves the page.
- **No diffing.** An action changes the page itself, with `app/dom.ts`: `replace(...views)` swaps in each top-level element by its id (keeping focus on a replaced element with the same id), `append`/`prepend`/`before`/`after`, `fill(id, view)` for an element's content, `remove(...ids)`, `toast(...)`. Re-rendering a region that holds the input being typed in would lose it, so don't.
- Pages import what they need directly (`data/*`, `app/*`, `pages/_help-views.ts`, `pages/_shared-views.ts`). Imports use `.js` extensions; Vite resolves them to the `.ts` files.

### The service worker

`src/web/sw.ts` does only three things: keeps the build's files in a cache (the build fills in `__FILES__` and `__VERSION__`), answers navigations under `/web/` with the shell, and runs **sync and every authenticated call to the server** when a page asks over `postMessage` (`app/worker.ts` `call("sync")`, `authFetch(...)`, `call("deleteAccount")`). The worker runs these one at a time for every tab (`data/sync-queue.ts`), so two can't sync at once or refresh the login token over each other. In development (`npm start`) it's registered as a module worker from `/web/sw.ts` and does only the last.

The production build (`vite build`, `vite.config.ts`) writes the HTML pages, hashed modules and CSS under `/web/assets/`, copies `src/web/images` unhashed (made by `tasks/make-icons.sh`; the manifest names its icons) except what the app shell links, which gets hashed copies (`apple-touch-icon.png`, `manifest.json`; `soccer.ico` is linked with `vite-ignore` since the manifest names it too), then builds `/web/sw.js` as a **classic** script with the list of every file. It must stay classic: browsers that installed an earlier version registered it as one.

The auth pages (`/login`, `/register`, `/forgot-password`, `/reset-password`) and `/` are plain HTML pages of their own, outside the worker's scope; `src/js/app.js` is their script, and writes the login tokens into the same IndexedDB.

### Data layer & sync

- All app data lives in **IndexedDB via `idb-keyval`**. `src/web/data/db.ts` wraps `set`/`update` so that anything with a `_rev` field is added to the `"updated"` set on write (and, in a page, fires `db:changed`).
- `src/web/data/sync.ts` (run by the service worker) is the bidirectional sync against TrailBase at `/api/data/soccer`. It posts updated keys, receives server changes, writes them back, updates `lastSyncedId`, and clears `"updated"`. Auth tokens (TrailBase 1h TTL) are auto-refreshed once on 401 via `/api/auth/v1/refresh`.
- `src/web/app/sync.ts` asks the worker to sync once per browser session and a moment after each `db:changed` (debounced), and keeps the header's sync count. When a sync brings new data it redraws the page. It is suppressed during a match when Settings' `disableAutoSyncDuringGame` is set. Errors are swallowed silently; the sync button reports them.
- **Anything saved with `_rev` syncs to the backend.** Calling `set`/`update` with `sync: false` (or on a value with no `_rev`) keeps it local-only — used for auth tokens, settings, the `updated` set itself, and ephemeral `loggedIn` flag.

### Match state machine

`src/web/pages/match/state-logic.ts` is the pure state-machine for in-game player status (`inPlay`/`onDeck`/`out`/`notPlaying`) and time tracking. **Player state transitions and time arithmetic must go through the calculator classes (`GameTimeCalculator`, `PlayerGameTimeCalculator`)** to keep `gameTime[]` invariants intact (open-ended intervals have `start` only, closed have both). The unit tests in `state-logic.test.ts` are the contract — extend them when adding transitions.

### Native client

`native/` is a second client, written in V on gg/sokol (the same stack as `../weight/desktop`). It syncs with the same TrailBase endpoint and stores records under the same keys and shapes, so changes to a record's shape, its key, or the sync protocol must be made in both clients. `native/core/` ports the TypeScript logic file by file (each file names what it ports); `native/core/match.v` mirrors `state-logic.ts` and its tests.

### Code conventions

- 2-space indent, TypeScript strict mode including `noUnusedLocals` / `noUnusedParameters` / `noImplicitReturns`.
- ES2022 modules, NodeNext resolution — **imports must use `.js` extensions** even for `.ts` source files.
- `oxfmt` for formatting (`npm run fmt`).
