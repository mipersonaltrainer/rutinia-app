// Builds .env.local for CI from the JSON printed by `supabase status -o json`.
//   supabase status -o json 2>/dev/null | node scripts/ci/write-env.mjs > .env.local
// Newer CLIs name the keys PUBLISHABLE_KEY / SECRET_KEY, older ones ANON_KEY / SERVICE_ROLE_KEY: both are accepted.
// Only variable NAMES are ever printed in errors, never values.
import { readFileSync } from "node:fs";

const FIRST = (obj, names) => names.map((n) => obj[n]).find((v) => typeof v === "string" && v.trim() !== "");

export function buildEnv(status) {
  const url = FIRST(status, ["API_URL"]) ?? "http://127.0.0.1:54321";
  const publishable = FIRST(status, ["PUBLISHABLE_KEY", "ANON_KEY"]);
  const service = FIRST(status, ["SECRET_KEY", "SERVICE_ROLE_KEY"]);
  const missing = [["PUBLISHABLE_KEY|ANON_KEY", publishable], ["SECRET_KEY|SERVICE_ROLE_KEY", service]].filter(([, v]) => !v).map(([n]) => n);
  if (missing.length) throw new Error(`supabase status is missing: ${missing.join(", ")}`);
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw new Error("refusing to write CI env for a non-local Supabase URL");
  return [`NEXT_PUBLIC_SUPABASE_URL=${url}`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable}`, `SUPABASE_SERVICE_ROLE_KEY=${service}`, `APPLICATION_BASE_URL=http://localhost:3000`, ""].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { process.stdout.write(buildEnv(JSON.parse(readFileSync(0, "utf8")))); }
  catch (e) { console.error(`write-env: ${e.message}`); process.exit(1); }
}
