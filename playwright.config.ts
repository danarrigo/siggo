import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run fixtures && npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    timeout: 120000,
    env: {
      SIGNAL_E2E: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_URL: "",
      GROQ_API_KEY: "",
      KAGGLE_API_TOKEN: "",
      KAGGLE_USERNAME: "",
      KAGGLE_KEY: "",
      BETTER_AUTH_SECRET: "",
      GITHUB_CLIENT_ID: "",
      GITHUB_CLIENT_SECRET: "",
      AUTH_ALLOWED_EMAIL: "",
      VERCEL: "",
    },
  },
});
