import { defineConfig } from "@playwright/test";
import { PHONE_APP_PORT } from "../env.js";

// Speed measurements on the connected phone's Chrome; run them with
// tasks/measure-speed.sh, which connects the phone first. Separate from the
// end-to-end suite (`*.perf.ts`, not `*.spec.ts`), and with no backend: the
// app runs logged out on a localhost origin of its own.
export default defineConfig({
  testDir: ".",
  testMatch: "*.perf.ts",
  workers: 1,
  reporter: "list",
  timeout: 900_000,
  webServer: {
    command: `npx tsx ./node_modules/@jon49/sw/bin/start.ts --env=dev -p ${PHONE_APP_PORT}`,
    cwd: new URL("../..", import.meta.url).pathname,
    url: `http://localhost:${PHONE_APP_PORT}/login/`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
