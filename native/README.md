# Soccer (native)

A native client for the soccer app, written in [V](https://vlang.io) with
the same toolkit as `../weight/desktop`. It does what the web app does and
works offline: teams and players, games and the published schedule, the
match view (positions, substitutions, clocks, goals), stats, formations,
sharing a team with other coaches and joining one, and login, registration
and password reset on their own screens. It syncs with the same TrailBase
backend and record format, so the web and native clients share data.

It builds and runs on Linux and Android. Windows and macOS type-check and
generate C (`make check`); iOS waits on a fix in V (see below). The code is
shared; only packaging and a few platform details differ.

## Build and run

```sh
make run          # build and start
make build        # optimized ./soccer
make install      # ./soccer to ~/.local/bin, plus a launcher and icon
make test         # unit tests for core/ (the server test skips without a server)
make check        # type-check and generate C for Linux, Windows and macOS
make android      # ./soccer.apk (needs the Android SDK, NDK and vab)
make install-apk  # install it on the connected phone or emulator
```

Set `V=/path/to/v` if `v` is not on your `PATH`. From the repo root,
`npm run build:native` and `npm run install:native` do the same.

Options: `soccer [--data-dir DIR] [--size WxH] [--server URL] [--demo] [--script FILE]`.
`--server` points it at another backend (it is remembered). `--size 400x820`
shows the phone layout.

### System packages

- **Linux (X11, which also runs under XWayland):**
  `sudo apt install libx11-dev libxi-dev libxcursor-dev libxrandr-dev libgl-dev libegl-dev`.
  Copy and paste use `wl-clipboard` (Wayland) or `xclip`/`xsel` (X11).
- **macOS:** the Xcode command line tools.
- **Windows:** nothing beyond V and its C compiler.

## Layout

```
main.v              entry point: window, embedded fonts, event wiring
app.v               app state, routing and back history, header, toasts,
                    confirm dialog, sync rounds
jobs.v              other network calls on worker threads, clipboard
screen_*.v          the screens: teams (and joining), team (players), share,
                    games (and one game, the goal picker), match, stats,
                    formation (and templates), settings (and login, register,
                    forgot password)
platform_*.c.v      per-platform bits: Android's data folder, screen density,
                    HTTPS roots, keyboard, insets and Back button
android/            the Android manifest and activity (Java), and the JNI
                    bridge between them and the app (text_bridge.h)
autopilot.v         --script and --demo, for checking the app without a person
gui/                the immediate-mode toolkit from the weight app, plus long
                    press, right click, horizontal scrolling, toggles,
                    segmented choices and paste
core/               no GUI imports: records and keys, models, the match state
                    machine and its actions, stats tables, formations, the
                    schedule page, the store file, sync, and the TrailBase API
```

`core/` follows the web app's TypeScript closely; each file names the module
it ports. `core/match.v` is `pages/match/state-logic.ts` and its helpers:
change player status and time through its methods, as the web app requires
of its calculator classes, and extend `core/core_test.v` with them.

## Data and sync

- Every record lives under the web client's IndexedDB key, written as JSON
  (`"teams"`, `["team",1]`, `["player-game","<space uuid>",3,7]`, …), with
  the same shape. They are kept in one file, `soccer-data.json`, in
  `~/.local/share/soccer` on Linux, `~/Library/Application Support/Soccer` on
  macOS, `%AppData%\Soccer` on Windows, and the app's private files folder on
  Android. Override with `--data-dir` or `$SOCCER_DATA_DIR`. Every change
  rewrites the file atomically. Login tokens are in `auth.json` (mode 0600).
  Fields this client doesn't know about are kept when it writes a record.
- Sync is the web app's: `POST /api/data/soccer` with a cursor for personal
  rows and one per shared team (space), last write wins. A 403 (a record
  names a space we've left) triggers a data-free sync to learn the current
  spaces, then one retry. Teams moved into a shared team on another device
  are followed. Edits made while a sync is in flight stay queued.
- Sync runs at startup, 1.5 seconds after an edit (not during a match when
  Settings > Disable auto-sync during games is on), when the window regains
  focus (at most once a minute), and on demand (↻ or Ctrl+R).
- Settings has the web app's data export, sync log and force-resync tools;
  exports go to `~/Downloads`.

## Checking it

- `make test` runs the unit tests. With a throwaway server it also runs
  `core/server_test.v`, which syncs two devices and two coaches, shares a
  team, joins by invite, publishes a schedule and removes a coach:

  ```sh
  E2E_API_PORT=4011 ../e2e/backend.sh &
  SOCCER_TEST_SERVER=http://localhost:4011 \
  SOCCER_TEST_DB=$PWD/../e2e/.depot/data/main.db make test
  ```

- `--demo` fills an empty data folder with a team in the middle of a game,
  and `--script` drives the app step by step (clicks, holds, typing,
  screenshots); see `autopilot.v`. With `xvfb-run` it needs no display:

  ```sh
  printf 'go match 1 2\nwait 3\nshot match.png\nquit\n' > steps.txt
  xvfb-run -a ./soccer --data-dir /tmp/demo --demo --script steps.txt
  ```

## Using it

- **Match:** tap a player, then where they go. A field position queues a
  bench player for it (or moves a field player there); a queued player's
  own spot swaps just them in; Bench and Not playing take the selected
  player off. Swap puts every queued player on. With the Goal stat on, tap
  our score and then the scorer (or No scorer). Hold a score (or right click
  it) to take a point back. Tap the clock to start or pause.
- **Text size:** Ctrl + and Ctrl − (also Ctrl with the scroll wheel), Ctrl 0
  to reset, or Settings. **Back:** ‹ in the header, Escape, Backspace or
  Ctrl+←. **Paste** into fields with Ctrl+V.

## Phones

Touch (tap, drag to scroll, long press) and the on-screen keyboard are
handled, and the match view has a portrait layout with the bench below the
field and the drop targets floating at the bottom.

- **Android** (6.0 and up, OpenGL ES 3.1): install the SDK (platform 34,
  build-tools 34), NDK r27 and [vab](https://github.com/vlang/vab), set
  `ANDROID_HOME` and `ANDROID_NDK_ROOT`, then `make android`. It was checked
  on an Android 14 emulator: login over HTTPS, adding a team, the keyboard,
  Back, rotation, and leaving and returning to the app. Things that differ
  from the desktop, all in `platform_android.c.v` and `android/`:
  - `android/AndroidManifest.xml` replaces vab's, which lacks the INTERNET
    permission. vab edits nothing in a manifest you supply, so the package
    id, version and SDK levels are written there too; keep them in step with
    the Makefile.
  - `android/src/io/v/android/VActivity.java` replaces vab's activity.
    sokol drops Android's key events and can't show the keyboard, so a
    hidden view takes the keyboard's input (including words it is still
    composing) and passes characters, Backspace and Enter to the app through
    `android/text_bridge.h`. It also reports what the status bar and keyboard
    cover, so the gui lays out between them and scrolls the focused field
    into view.
  - sokol ends the app on Back. A `#flag` hides Back from it, so Java gets
    it: Back closes a dialog or goes back a screen, and on the first screen
    puts the app in the background.
  - Text is scaled by the screen's density; gg on Android would fit the
    window size we ask for to the screen instead.
  - V's TLS looks for a CA bundle in the usual Linux places. Android keeps
    one file per root, so they are joined into `ca-roots.pem` in the data
    folder at startup and `$SSL_CERT_FILE` points at it.
  - `-d sokol_gles3`: vab builds sokol for GLES 3 but doesn't tell V, and
    gg would compile desktop GLSL. `-prod` for an optimized build (vab
    signs it with its debug key; pass `--keystore` for a release).
  - stderr goes to logcat (`adb logcat -s soccer V`), for sokol's messages.
  - The emulator's default software GPU only has GLES 3.0; start it with
    `-gpu swangle_indirect` (or `host`).
  - Not done: a hardware keyboard's keys (sokol drops them), copy and paste,
    and the export, which writes inside the app's private folder.
- **iOS:** `v -os ios .` stops inside V's own `net` module
  (`unknown struct Ip6`): `vlib/net` defines its address structs per OS and
  has no iOS variant. That needs fixing in V (or routing `core/api.v`'s `http_request`
  through `NSURLSession`). Also keep tokens in the Keychain instead of
  `auth.json`, and handle safe-area insets.

The share sheet for invite links is not done yet; the Open button opens the
link in the browser.
