import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  webServer: process.env.PLAYWRIGHT_CI_SERVER === "1" ? { command: "pnpm dev --port 3100", url: "http://127.0.0.1:3100/cuenta/ingresar", reuseExistingServer: false, timeout: 120_000 } : undefined,
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: "line",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100",
    locale: "es-AR",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, browserName: "chromium" } },
  ],
});
