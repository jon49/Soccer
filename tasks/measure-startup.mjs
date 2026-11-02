// Times how long the soccer apps take to start on the connected phone; see
// docs/startup-and-size.html. Run it through tasks/measure-startup.sh.
//
// Each copy of the web app is measured, one per browser it was installed
// from (Chrome, Chrome Beta, ...), in that browser.
//
// - web, cold: the browsers and the installed web app are force-stopped, then
//   the app is opened from its launcher. The page's own timing (read through
//   Chrome's remote debugging) gives when its navigation started and when the
//   service worker answered.
// - web, Chrome running: as above, but Chrome is started (on a test tab)
//   and left to settle first.
// - native: the V app, force-stopped, until its first frame (am start -W).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOST = process.env.SOCCER_HOST ?? "soccer.jnyman.com";
const NATIVE = "com.jnyman.soccer";
const PORT = 9223;
const TEST_TAB = "about:blank#soccer-startup-test";
const runs = Number(process.argv[2] ?? 3);

// Each adb call and request gives up rather than hang (Chrome's remote
// debugging sometimes stops answering).
const adb = (...a) =>
  execFileSync("adb", a, { encoding: "utf8", timeout: 60000, stdio: "pipe" }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const BROWSERS = ["com.android.chrome", "com.chrome.beta", "com.chrome.dev", "com.chrome.canary"];

// The browser a WebAPK runs in, from its manifest (the runtimeHost meta-data).
function runtimeHost(pkg) {
  let tools = `${process.env.ANDROID_HOME}/build-tools`;
  let aapt = `${tools}/${readdirSync(tools).sort().pop()}/aapt`;
  let dir = mkdtempSync(join(tmpdir(), "webapk-"));
  try {
    let apk = join(dir, "base.apk");
    adb("pull", adb("shell", `pm path ${pkg}`).split("\n")[0].replace("package:", ""), apk);
    let xml = execFileSync(aapt, ["dump", "xmltree", apk, "AndroidManifest.xml"], {
      encoding: "utf8",
    });
    return /shell_apk\.runtimeHost"\)\s*\n\s*A: android:value\(0x01010024\)="([^"]+)"/.exec(
      xml,
    )?.[1];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The installed web apps (WebAPKs) whose site is HOST, with their browsers.
function webApks() {
  let apks = [];
  for (let line of adb("shell", "pm list packages org.chromium.webapk").split("\n")) {
    let pkg = line.replace("package:", "").trim();
    if (pkg && adb("shell", `dumpsys package ${pkg}`).includes(`Authority: "${HOST}"`))
      apks.push({ pkg, browser: runtimeHost(pkg) ?? "com.android.chrome" });
  }
  return apks;
}

// Points PORT at the browser's remote debugging socket; a second Chromium
// browser running at once names its socket with its pid.
function forward(browser) {
  let pid = adb("shell", `pidof ${browser} || true`).split(/\s+/)[0];
  let sockets = adb("shell", "cat /proc/net/unix");
  let name =
    pid && sockets.includes(`@chrome_devtools_remote_${pid}`)
      ? `chrome_devtools_remote_${pid}`
      : "chrome_devtools_remote";
  adb("forward", `tcp:${PORT}`, `localabstract:${name}`);
}

const launcher = (pkg) =>
  adb("shell", `cmd package resolve-activity --brief ${pkg}`).split("\n").pop().trim();

async function pages() {
  try {
    return await (
      await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(5000) })
    ).json();
  } catch {
    return [];
  }
}

async function evaluate(page, expression) {
  let ws = new WebSocket(page.webSocketDebuggerUrl);
  await Promise.race([
    new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j))),
    sleep(10000).then(() => Promise.reject(new Error("remote debugging didn't answer"))),
  ]);
  let reply = new Promise((r) => (ws.onmessage = (m) => r(JSON.parse(m.data))));
  ws.send(
    JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression, returnByValue: true },
    }),
  );
  let res = await Promise.race([reply, sleep(10000).then(() => ({}))]);
  ws.close();
  return res.result?.result?.value;
}

// Navigation timing; Chrome loads the page behind its splash screen, so
// there are no paint timings to read.
const PROBE = `(() => {
  let n = performance.getEntriesByType("navigation")[0];
  return { origin: performance.timeOrigin, workerStart: n.workerStart, fetchStart: n.fetchStart,
    responseStart: n.responseStart, load: n.loadEventEnd };
})()`;

async function webRun(pkg, browser, activity, chromeRunning) {
  adb("shell", [pkg, ...BROWSERS].map((p) => `am force-stop ${p}`).join("; "));
  await sleep(3000);
  if (chromeRunning) {
    let opened = adb(
      "shell",
      `am start -a android.intent.action.VIEW -d '${TEST_TAB}' ${browser} 2>&1`,
    );
    if (/Error/.test(opened)) throw new Error(opened);
    await sleep(15000); // Chrome reloads its tabs; let it settle
    adb("shell", "input keyevent KEYCODE_HOME");
    await sleep(2000);
  }
  // No -W: the WebAPK's launcher hands off to Chrome, and -W would wait on it forever.
  let t0 = Number(adb("shell", `date +%s%3N; am start -n ${activity} >/dev/null`).split("\n")[0]);
  let page;
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(500);
    forward(browser);
    page = (await pages()).find((p) => p.type === "page" && p.url.includes(HOST));
  }
  if (!page) throw new Error(`the ${HOST} page never appeared`);
  await sleep(4000); // let it finish loading
  let m = await evaluate(page, PROBE);
  if (!m) throw new Error("couldn't read the page's timing");
  console.log(`  (${page.url})`);
  let toNav = m.origin - t0;
  return {
    "tap → navigation": toNav,
    "service worker": m.responseStart - (m.workerStart || m.fetchStart),
    "tap → loaded": toNav + m.load,
  };
}

async function closeTestTabs() {
  for (let p of await pages()) {
    if (p.url.startsWith(TEST_TAB))
      await fetch(`http://127.0.0.1:${PORT}/json/close/${p.id}`, {
        signal: AbortSignal.timeout(5000),
      });
  }
}

function report(name, rows) {
  for (let r of rows)
    console.log(
      `  ${Object.entries(r)
        .map(([k, v]) => `${k} ${Math.round(v)} ms`)
        .join(", ")}`,
    );
  let keys = Object.keys(rows[0]);
  console.log(
    `${name}, median: ${keys.map((k) => `${k} ${Math.round(median(rows.map((r) => r[k])))} ms`).join(", ")}\n`,
  );
}

let apks = webApks();
for (let { pkg, browser } of apks) {
  let activity = launcher(pkg);
  try {
    for (let [name, warm] of [
      [`web app in ${browser}, cold`, false],
      [`web app in ${browser}, browser running`, true],
    ]) {
      console.log(`${name} (${pkg}):`);
      let rows = [];
      for (let i = 0; i < runs; i++) rows.push(await webRun(pkg, browser, activity, warm));
      report(name, rows);
    }
    await closeTestTabs();
  } finally {
    adb("forward", "--remove", `tcp:${PORT}`);
  }
}
if (!apks.length)
  console.log(`No installed web app for ${HOST}; install it from Chrome (Add to Home screen).\n`);

if (adb("shell", `pm list packages ${NATIVE}`).includes(NATIVE)) {
  console.log(`native app (${NATIVE}):`);
  let activity = launcher(NATIVE);
  let rows = [];
  for (let i = 0; i < runs; i++) {
    adb("shell", `am force-stop ${NATIVE}`);
    await sleep(3000);
    let out = adb("shell", `am start -W -n ${activity}`);
    rows.push({ "tap → first frame": Number(/TotalTime: (\d+)/.exec(out)?.[1]) });
    await sleep(3000);
  }
  report("native app", rows);
} else {
  console.log(`The native app isn't installed (tasks/install-apk.sh).`);
}
adb("shell", "input keyevent KEYCODE_HOME");
