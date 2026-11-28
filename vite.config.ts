// The web app's build and dev server (@jon49/sw/vite.js, shared with
// ../weight):
//
// - `src/` is the site: /web/index.html is the app shell; /, /login/,
//   /register/, /forgot-password/ and /reset-password/ are pages of their own.
// - Every page of the app (/web/teams, /web/match, ...) is the shell, which
//   renders it (@jon49/web/app/router.js). The dev server answers them with
//   the shell, as the service worker and NGINX do.
// - src/web/images is copied unhashed (the manifest names the icons), except
//   apple-touch-icon.png: the app shell links it, so the build ships a hashed
//   copy of it already.
// - The service worker, /web/sw.js, is built last, as a classic script (the
//   browsers that already have the app registered it as one), with the list
//   of every file the build emitted to keep offline.
import path from "node:path";
import { defineConfig } from "vite";
import { appConfig } from "@jon49/sw/vite.js";

export default defineConfig(
  appConfig({
    name: "soccer",
    root: path.resolve(import.meta.dirname, "src"),
    outDir: path.resolve(import.meta.dirname, "deploy"),
    port: 8009,
    api: process.env.SOCCER_API ?? "http://localhost:4000",
    linked: ["apple-touch-icon.png"],
  }),
);
