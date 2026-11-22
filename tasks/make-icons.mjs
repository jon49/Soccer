// Renders the app's icons from src/web/images/soccer.svg with Playwright's
// Chromium (see make-icons.sh). The ball is a hair wider than tall, so each
// icon centers it in a square. Its panels are see-through, so a white disc
// goes behind it: white panels on any wallpaper.
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const dir = new URL("../src/web/images/", import.meta.url);
const svg = await readFile(new URL("soccer.svg", dir), "utf8");
const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const icons = [
  // Install icons (manifest "any"): the ball alone, on transparent.
  { name: "icon-192.png", size: 192, ball: 0.94 },
  { name: "icon-512.png", size: 512, ball: 0.94 },
  // Android crops a maskable icon to its own shape, keeping a circle 80% across:
  // the ball sits inside it, on white.
  { name: "icon-maskable-512.png", size: 512, ball: 0.72, background: "#fff" },
  // iOS's home screen fills transparency with black, so give it white.
  { name: "apple-touch-icon.png", size: 180, ball: 0.8, background: "#fff" },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (let { name, size, ball, background } of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>
    html, body { margin: 0; width: ${size}px; height: ${size}px; background: ${background ?? "transparent"}; }
    body { display: grid; place-items: center; }
    body > * { grid-area: 1 / 1; width: ${ball * 100}%; height: ${ball * 100}%; }
    div { border-radius: 50%; background: #fff; scale: 0.98; }
    img { object-fit: contain; position: relative; }
  </style><div></div><img src="${src}">`);
  await page.locator("img").evaluate((img) => img.decode());
  await page.screenshot({ path: new URL(name, dir).pathname, omitBackground: !background });
  console.log(name);
}
await browser.close();
