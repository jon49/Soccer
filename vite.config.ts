// The web app's build and dev server.
//
// - `src/` is the site: /web/index.html is the app shell; /, /login/,
//   /register/, /forgot-password/ and /reset-password/ are pages of their own.
// - Every page of the app (/web/teams, /web/match, ...) is the shell, which
//   renders it (src/web/app/router.ts). The dev server answers them with the
//   shell, as the service worker and NGINX do.
// - The service worker, /web/sw.js, is built last, as a classic script (the
//   browsers that already have the app registered it as one), with the list
//   of every file the build emitted to keep offline.
import { createHash } from "node:crypto";
import { cp, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { build, defineConfig, type Connect, type Plugin } from "vite";

const root = path.resolve(import.meta.dirname, "src");
const api = process.env.SOCCER_API ?? "http://localhost:4000";

const pages = ["index.html", "web/index.html", "login/index.html", "register/index.html"]
  .concat(["forgot-password/index.html", "reset-password/index.html"])
  .map((x) => path.join(root, x));

// Made by tasks/make-icons.sh and kept as they are, with no hash in the name.
const copied = ["web/images", "web/manifest.json"];

function isFile(p: string) {
  return p.lastIndexOf("/") < p.lastIndexOf(".");
}

// /web/teams?teamId=1 -> /web/index.html
const shell: Connect.NextHandleFunction = (req, _res, next) => {
  let url = new URL(req.url ?? "/", "http://x");
  if (url.pathname.startsWith("/web/") && !isFile(url.pathname) && req.method === "GET") {
    req.url = "/web/index.html";
  }
  next();
};

async function filesIn(dir: string): Promise<string[]> {
  let entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((x) => x.isFile())
    .map((x) => path.relative(dir, path.join(x.parentPath, x.name)).split(path.sep).join("/"));
}

function serviceWorker(): Plugin {
  let outDir = "";
  return {
    name: "soccer-service-worker",
    apply: "build",
    configResolved(config) {
      // `--outDir` is relative to the root, src/.
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      for (let x of copied) {
        await cp(path.join(root, x), path.join(outDir, x), { recursive: true });
      }
      let files = (await filesIn(outDir)).filter((x) => !x.endsWith(".gz")).sort();
      let hash = createHash("sha256");
      for (let x of files) hash.update(x).update(await readFile(path.join(outDir, x)));
      await build({
        configFile: false,
        root,
        logLevel: "warn",
        define: {
          __FILES__: JSON.stringify(files.map((x) => `/${x}`)),
          __VERSION__: JSON.stringify(hash.digest("hex").slice(0, 12)),
        },
        build: {
          outDir,
          emptyOutDir: false,
          copyPublicDir: false,
          lib: {
            entry: path.join(root, "web/sw.ts"),
            formats: ["iife"],
            name: "sw",
            fileName: () => "web/sw.js",
          },
        },
      });
    },
  };
}

export default defineConfig({
  root,
  publicDir: false,
  appType: "mpa",
  build: {
    outDir: path.resolve(import.meta.dirname, "deploy"),
    emptyOutDir: true,
    // Under /web/, which NGINX serves with a long cache (the names are hashed).
    assetsDir: "web/assets",
    target: "es2023",
    rollupOptions: { input: pages },
  },
  server: {
    port: 8009,
    strictPort: true,
    proxy: { "/api": { target: api, changeOrigin: false } },
  },
  preview: {
    port: 8009,
    strictPort: true,
    proxy: { "/api": { target: api, changeOrigin: false } },
  },
  plugins: [
    {
      name: "soccer-app-shell",
      configureServer: (server) => void server.middlewares.use(shell),
      configurePreviewServer: (server) => void server.middlewares.use(shell),
    },
    serviceWorker(),
  ],
});
