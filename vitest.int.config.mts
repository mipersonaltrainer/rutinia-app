import { defineConfig } from "vitest/config";
import path from "node:path";
import { loadEnv } from "vite";
export default defineConfig(({ mode }) => ({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "server-only": path.resolve(import.meta.dirname, "node_modules/next/dist/compiled/server-only/empty.js") } },
  test: { globalSetup: ["tests/setup/purge-test-users.ts"], include: ["tests/integration/**/*.test.ts"], env: loadEnv(mode, process.cwd(), ""), fileParallelism: false },
}));
