import { defineConfig, devices } from "@playwright/test";
import { API_PORT, APP_PORT } from "./e2e/env.js";

// End-to-end tests: the real app (service worker and all) in Chromium against
// a throwaway ImageBase server. Ports differ from `npm start` (8009/4000) so the
// suite can run alongside a dev session.
export default defineConfig({
  testDir: "./e2e",
  // One backend with a single "soccer" app owner, and tests that flip it:
  // run them one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  timeout: 90_000,
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "./e2e/backend.sh",
      url: `http://localhost:${API_PORT}/api/auth/v1/status`,
      env: { E2E_API_PORT: String(API_PORT) },
      // The first run builds the ImageBase server.
      timeout: 300_000,
      reuseExistingServer: false,
    },
    {
      command: `npx vite --port ${APP_PORT}`,
      env: { SOCCER_API: `http://localhost:${API_PORT}` },
      url: `http://localhost:${APP_PORT}/login/`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
