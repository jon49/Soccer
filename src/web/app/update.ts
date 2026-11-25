// When a new version of the app is installed and waiting, #sw-message shows
// a link that switches to it; the page then reloads.
// https://deanhume.com/displaying-a-new-version-available-progressive-web-app/
let reloading = false;
navigator.serviceWorker?.addEventListener("controllerchange", () => {
  if (reloading || !hadController) return;
  reloading = true;
  location.reload();
});
// The first worker to take over the page (the first visit) needs no reload.
let hadController = !!navigator.serviceWorker?.controller;

function offer(worker: ServiceWorker) {
  let box = document.getElementById("sw-message");
  if (!box || box.firstChild) return;
  box.innerHTML = `<div class=inline><a id=skipWaiting href="#">Click here to update your app.</a></div>`;
  box.querySelector("a")!.addEventListener("click", (e) => {
    e.preventDefault();
    worker.postMessage("skipWaiting");
  });
}

export function watchForUpdates(reg: ServiceWorkerRegistration) {
  if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
  reg.addEventListener("updatefound", () => {
    let worker = reg.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) offer(worker);
    });
  });
}
