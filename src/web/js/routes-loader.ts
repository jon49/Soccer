// Loads routes.bundle.ts, which runs the service worker's routes in the page,
// once the page is drawn and idle, so it doesn't hold up the first draw.
// What it needs first, in order: the file map, the route table and self.sw.
// Each script is removed once run, so the page's scripts stay as rendered
// (htmz-nav compares them to the next page's). If any fails to load, the
// worker goes on answering everything.

function load(src: string, type?: string) {
  return new Promise<void>((resolve, reject) => {
    let script = document.createElement("script");
    if (type) script.type = type;
    script.src = src;
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`Couldn't load ${src}`));
    };
    document.head.append(script);
  });
}

async function start() {
  try {
    for (let src of ["/web/links.js", "/web/settings.global.js", "/web/server/shared.global.js"]) {
      await load(src);
    }
    await load("/web/js/routes.bundle.js", "module");
  } catch (e) {
    console.warn(e);
  }
}

function whenIdle() {
  if ("requestIdleCallback" in window) requestIdleCallback(() => start(), { timeout: 1000 });
  else setTimeout(start, 200);
}

// Only on pages the worker renders: it serves the file map.
if (location.pathname.startsWith("/web/") && navigator.serviceWorker?.controller) {
  if (document.readyState === "complete") whenIdle();
  else window.addEventListener("load", whenIdle, { once: true });
}
