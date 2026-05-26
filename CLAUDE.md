# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` — dev server on :8009, proxying `/api/*` to a local TrailBase on :4000.
- `npm run server` — build static files into `./server/public` then serve via `@jon49/sw`.
- `npm run start:full` — runs `start`, `server`, and `make -C ../ImageBase dev` (TrailBase backend) concurrently.
- `./server/start.sh [--rebuild]` — production-shaped local harness: builds into `./server/public`, starts TrailBase on :4000, and runs a tiny Node static + reverse proxy on :8009.
- `npm run build` — production build into `./deploy`.
- `npm run check` — `tsc --noEmit` typecheck.
- `npm test` — runs every `src/**/*.test.ts` via `tsx --test`. Single test: `tsx --test src/web/pages/match/state-logic.test.ts`.
- `npm run fmt` / `fmt:check` — format with oxfmt.

The `/api` path is owned by TrailBase (separate repo at `../ImageBase`). The Node dev proxy and NGINX in production both forward `/api/*` there.

## Architecture

This is an **offline-first PWA** where almost the entire application runs **inside the service worker** using the `@jon49/sw` framework. There is no traditional Node web server for the app — `src/web/sw.ts` intercepts `fetch` events and routes them to page handlers like a normal server would. The "backend" is just TrailBase, used as a sync target.

### The service worker as web framework

- `src/web/sw.ts` wires up the framework: `useRoutes` middleware dispatches to handlers, a `useHtmz` middleware appends toasts + sync-count badge + login dialog to POST responses, then `useResponse` serializes.
- `src/web/settings.global.ts` registers the route table. Each route maps a URL pattern to a `*.page.ts` file. Handlers are exported as `routePostHandler` / `routePage` / `routeGetHandler`.
- `src/web/server/shared.global.ts` assembles `self.sw` — the framework's god-object containing `db`, `globalDb`, `html`, `layout`, `repo`, `utils`, `validation`, `views`. **Page handlers grab everything off `self.sw` rather than importing**, e.g. `const { db, html, repo: { teamGet } } = self.sw;`. New shared functionality belongs in `shared.global.ts` so it's discoverable through this pattern. Types are declared in `src/types/global.d.ts`.
- HTML is rendered with tagged-template-literal streams from `html-template-tag-stream`. The frontend uses **HTMZ** (a tiny `<iframe name=htmz>`-based morph library) — forms POST to handlers and the returned HTML fragment is morphed into the page. There is no React/Vue/SPA framework.
- Client-side glue (auto-sync, toast, anchor handling, morph) is bundled separately into `src/web/js/app.bundle.ts`.

### Data layer & sync

- All app data lives in **IndexedDB via `idb-keyval`**. `src/web/server/db.ts` wraps `set`/`update` so that anything with a `_rev` field is added to the `"updated"` set on write.
- `src/web/server/sync.ts` is the bidirectional sync against TrailBase at `/api/data/soccer`. It posts updated keys, receives server changes, writes them back, updates `lastSyncedId`, and clears `"updated"`. Auth tokens (TrailBase 1h TTL) are auto-refreshed once on 401 via `/api/auth/v1/refresh`.
- `src/web/js/auto-sync.ts` triggers a debounced background sync after any mutating htmz response. It is suppressed during a match when `disableAutoSyncDuringGame` is set (`/web/match` path + meta tag). Errors are swallowed silently.
- **Anything saved with `_rev` syncs to the backend.** Calling `set`/`update` with `sync: false` (or on a value with no `_rev`) keeps it local-only — used for auth tokens, settings, the `updated` set itself, and ephemeral `loggedIn` flag.

### Match state machine

`src/web/pages/match/state-logic.ts` is the pure state-machine for in-game player status (`inPlay`/`onDeck`/`out`/`notPlaying`) and time tracking. **Player state transitions and time arithmetic must go through the calculator classes (`GameTimeCalculator`, `PlayerGameTimeCalculator`)** to keep `gameTime[]` invariants intact (open-ended intervals have `start` only, closed have both). The unit tests in `state-logic.test.ts` are the contract — extend them when adding transitions.

### CSS hashed-asset rewrite

The build emits hashed filenames (`base.4e713321.css`) but `src/web/css/app.css` imports `/web/css/base.css` (unhashed). Three places resolve the rewrite — keep them in sync if you touch any of them:

1. `src/web/sw.ts` — dev middleware (refreshes from file-map) and production fetch handler (uses cached hashed name) for pages inside the SW scope.
2. `./server/start.sh` Node proxy / `@jon49/sw` dev proxy — uses the build's file-map.
3. NGINX in production (`try_files $uri /web/$1.*.$2 =404;` or a generated `map`).

Auth pages (`/login`, `/register`, `/forgot-password`, `/reset-password`) live **outside** the SW scope and load `/web/css/app.css` directly, so the rewrite must work at the static-server / NGINX layer too.

### Code conventions

- 2-space indent, TypeScript strict mode including `noUnusedLocals` / `noUnusedParameters` / `noImplicitReturns`.
- ES2022 modules, NodeNext resolution — **imports must use `.js` extensions** even for `.ts` source files.
- `oxfmt` for formatting (`npm run fmt`).
