import { installDevice } from "./install-device.js";

// The Install page (pages/install.page.ts): opens and puts first the how-to
// for this device, and, where the browser offers one (Chrome, Edge), shows a
// button for its own install prompt. In the installed app, app.css shows a
// note saying so; an iPhone's older home-screen apps only say so through
// navigator.standalone, and a browser tab that just installed the app says
// so through appinstalled, so both mark <html data-installed>.

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let prompt: InstallPrompt | null = null;
let installed = (navigator as { standalone?: boolean }).standalone === true;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  prompt = e as InstallPrompt;
  update();
});

window.addEventListener("appinstalled", () => {
  installed = true;
  prompt = null;
  update();
});

document.addEventListener("click", async (e) => {
  if (!(e.target instanceof Element) || !e.target.closest("#installNow") || !prompt) return;
  let p = prompt;
  prompt = null;
  await p.prompt();
  await p.userChoice;
  update();
});

function update() {
  if (installed) document.documentElement.dataset.installed = "";
  let box = document.getElementById("installNowBox");
  if (box) box.hidden = !prompt;
  let steps = document.getElementById("installSteps");
  let device = installDevice(navigator.userAgent, navigator.maxTouchPoints);
  let mine = device && steps?.querySelector<HTMLDetailsElement>(`[data-device="${device}"]`);
  if (!steps || !mine) return;
  if (steps.firstElementChild !== mine) steps.prepend(mine);
  mine.open = true;
  let summary = mine.querySelector("summary");
  if (summary && !summary.querySelector(".install-mine")) {
    summary.insertAdjacentHTML("beforeend", ' <small class="install-mine">This device</small>');
  }
  let detected = document.getElementById("installDetected");
  if (detected) detected.hidden = false;
}

update();
// After each page is drawn (app/router.ts).
document.addEventListener("app:page", update);
