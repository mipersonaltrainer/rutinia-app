import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

// E2E runs against a PRODUCTION build served locally (the same server the CSP and instrumentation checks protect),
// talking to the local Supabase. Real Chrome is used (channel "chrome") so no browser has to be downloaded.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const PORT = Number(process.env.E2E_PORT ?? 3050);
const BASE = `http://localhost:${PORT}`;
// Fixed, local-only values the specs also need (the server and the test workers are separate processes).
export const E2E_CRON_SECRET = "e2e-local-cron-secret-0123456789abcdef0123456789";
export const E2E_ALERT_PORT = 3059;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false, workers: 1,            // the specs share one database and one FX-rate table
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: { baseURL: BASE, channel: process.env.E2E_BROWSER === "chromium" ? undefined : "chrome", trace: "retain-on-failure", screenshot: "only-on-failure", locale: "es-CO", timezoneId: "America/Bogota", contextOptions: { reducedMotion: "reduce" } },      // steady state by default: axe and screenshots never catch a half-faded element; the motion tests below opt back in
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `${BASE}/api/health`, timeout: 60_000, reuseExistingServer: false,
    env: {
      ...(process.env as Record<string, string>),
      ALLOW_LOCAL_PRODUCTION: "1", APPLICATION_BASE_URL: BASE,
      CRON_SECRET: E2E_CRON_SECRET, ADMIN_ALERT_WEBHOOK_URL: `http://127.0.0.1:${E2E_ALERT_PORT}/alert`, FX_MONITORING: "on", FX_MAX_AGE_HOURS: "168", FX_WARN_HOURS: "24",
      // Auth abuse limits: the per-account login limit stays at its real value; the per-IP one is raised because the whole suite signs in from one address.
      AUTH_MIN_FILL_MS: "2000", AUTH_LIMIT_LOGIN_IP: "100000", AUTH_LIMIT_SIGNUP_IP: "5", GOOGLE_SIGNIN: "on",      // the E2E asserts the per-address cut-off, so it pins the small value the defaults no longer have
      // Fake provider keys: enough to enable the Bold button signer (and the Wompi settings the FX monitor still reads). Nothing here
      // can reach a real account, and the specs intercept the browser's request for Bold's checkout library.
      BOLD_IDENTITY_KEY: "bold_identity_e2e_local", BOLD_SECRET_KEY: "bold_secret_e2e_local",
      WOMPI_ENVIRONMENT: "sandbox", WOMPI_PUBLIC_KEY: "pub_e2e_local", WOMPI_PRIVATE_KEY: "prv_e2e_local", WOMPI_EVENTS_SECRET: "evt_e2e_local", WOMPI_INTEGRITY_SECRET: "int_e2e_local",
      AI_PROVIDER: "", ANTHROPIC_API_KEY: "", ANTHROPIC_BASE_URL: "", PAYPAL_CLIENT_ID: "", PAYPAL_CLIENT_SECRET: "", PAYPAL_WEBHOOK_ID: "",
    },
  },
});
