import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { buildEnv } from "../scripts/ci/write-env.mjs";

describe("scripts/ci/write-env", () => {
  const legacy = { API_URL: "http://127.0.0.1:54321", ANON_KEY: "anon-legacy", SERVICE_ROLE_KEY: "service-legacy", STUDIO_URL: "x" };
  const modern = { API_URL: "http://127.0.0.1:54321", PUBLISHABLE_KEY: "sb_publishable_new", SECRET_KEY: "sb_secret_new", ANON_KEY: "anon-also", SERVICE_ROLE_KEY: "service-also" };
  const parse = (s: string) => Object.fromEntries(s.trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));

  it("maps legacy key names", () => expect(parse(buildEnv(legacy))).toMatchObject({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-legacy", SUPABASE_SERVICE_ROLE_KEY: "service-legacy" }));
  it("prefers the new publishable/secret names when both exist", () => expect(parse(buildEnv(modern))).toMatchObject({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_new", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_new" }));
  it("defaults the URL to the local API", () => expect(parse(buildEnv({ ANON_KEY: "a", SERVICE_ROLE_KEY: "s" })).NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321"));
  it("fails naming the missing variables, never echoing values", () => {
    expect(() => buildEnv({ ANON_KEY: "anon-secret-value" })).toThrow(/SECRET_KEY\|SERVICE_ROLE_KEY/);
    try { buildEnv({ ANON_KEY: "anon-secret-value" }); } catch (e) { expect(String(e)).not.toContain("anon-secret-value"); }
    expect(() => buildEnv({})).toThrow(/PUBLISHABLE_KEY\|ANON_KEY/);
  });
  it("refuses a non-local Supabase URL (a CI run must never point at a real project)", () => expect(() => buildEnv({ API_URL: "https://abcd.supabase.co", ANON_KEY: "a", SERVICE_ROLE_KEY: "s" })).toThrow(/non-local/));
  it("works as the CLI the workflow uses (JSON on stdin → env file on stdout), and fails with exit code 1 on bad input", () => {
    const out = execFileSync("node", ["scripts/ci/write-env.mjs"], { input: JSON.stringify(legacy) }).toString();
    expect(out).toContain("SUPABASE_SERVICE_ROLE_KEY=service-legacy");
    expect(() => execFileSync("node", ["scripts/ci/write-env.mjs"], { input: "not json", stdio: ["pipe", "pipe", "pipe"] })).toThrow();
  });
});

describe(".github/workflows/ci.yml", () => {
  const wf = readFileSync(".github/workflows/ci.yml", "utf8");
  it("runs on pushes to main and on pull requests", () => { expect(wf).toMatch(/pull_request:/); expect(wf).toMatch(/push:\s*\n\s*branches: \[main\]/); });
  it("uses least-privilege permissions and needs no repository secrets (safe for forks)", () => { expect(wf).toMatch(/permissions:\s*\n\s*contents: read/); expect(wf).not.toMatch(/secrets\./); expect(wf).not.toMatch(/pull_request_target/); });
  it("runs every required check", () => {
    for (const cmd of ["npm ci", "npm run lint", "npx tsc --noEmit", "npm test", "npm run exercises:check", "supabase start", "write-env.mjs", "npm run exercises:seed", "npm run test:int", "supabase/rls_test.sql", "playwright install", "npm run test:e2e"]) expect(wf, cmd).toContain(cmd);
  });
  it("seeds the library and starts Supabase before the integration and E2E steps", () => {
    const at = (s: string) => wf.indexOf(s);
    expect(at("supabase start")).toBeLessThan(at("write-env.mjs")); expect(at("write-env.mjs")).toBeLessThan(at("npm run exercises:seed"));
    expect(at("npm run exercises:seed")).toBeLessThan(at("npm run test:int")); expect(at("npm run test:int")).toBeLessThan(at("npm run test:e2e"));
  });
  it("uploads the Playwright report on failure and always stops Supabase", () => { expect(wf).toMatch(/if: failure\(\)[\s\S]*upload-artifact/); expect(wf).toMatch(/if: always\(\)[\s\S]*supabase stop/); });
  it("bounds every job and cancels superseded runs", () => { expect((wf.match(/timeout-minutes:/g) ?? []).length).toBeGreaterThanOrEqual(2); expect(wf).toMatch(/concurrency:[\s\S]*cancel-in-progress: true/); });
  it("uses the system container name the purge and RLS steps rely on", () => { expect(readFileSync("supabase/config.toml", "utf8")).toMatch(/^project_id = "training-os"/m); expect(wf).toContain("supabase_db_training-os"); });
});

describe("supply-chain hardening of the workflows", () => {
  const files = readdirSync(".github/workflows").filter((f) => f.endsWith(".yml")).map((f) => [f, readFileSync(`.github/workflows/${f}`, "utf8")] as const);
  const usesLines = files.flatMap(([f, t]) => t.split("\n").map((l, i) => ({ f, i: i + 1, l })).filter((x) => /^\s*-?\s*uses:/.test(x.l)));

  it("there are workflows for CI, the dependency audit and CodeQL", () => expect(files.map(([f]) => f).sort()).toEqual(["audit.yml", "ci.yml", "codeql.yml"]));
  it("every third-party action is pinned to a full 40-character commit SHA with its version in a comment", () => {
    expect(usesLines.length).toBeGreaterThanOrEqual(8);
    for (const { f, i, l } of usesLines) expect(l, `${f}:${i}`).toMatch(/uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+# v\d+\.\d+\.\d+$/);
  });
  it("no workflow references secrets, pull_request_target, or any write permission", () => {
    for (const [f, t] of files) { expect(t, f).not.toMatch(/secrets\./); expect(t, f).not.toMatch(/pull_request_target/); expect(t, f).toMatch(/^permissions:\s*\n\s*contents: read/m); }
    const writes = files.flatMap(([f, t]) => [...t.matchAll(/^\s+([\w-]+): write/gm)].map((m) => `${f}:${m[1]}`));
    expect(writes).toEqual([]);          // CodeQL no longer uploads to Code scanning (private repo, no Advanced Security), so it needs no write permission at all
  });
  it("CodeQL keeps its report as an artifact instead of uploading it, so the check is green without Advanced Security", () => {
    const q = files.find(([f]) => f === "codeql.yml")![1];
    expect(q).toMatch(/upload: never/); expect(q).toMatch(/output: codeql-results/); expect(q).toMatch(/name: codeql-sarif/); expect(q).not.toMatch(/security-events: write/);
    expect(q).toMatch(/queries: security-extended/);          // the analysis itself is as strict as before
  });
  it("checkouts do not leave the token on disk", () => { for (const [f, t] of files) { const n = (t.match(/actions\/checkout@/g) ?? []).length; expect((t.match(/persist-credentials: false/g) ?? []).length, f).toBe(n); } });
  it("the Supabase CLI is an exact version, not 'latest'", () => { const ci = files.find(([f]) => f === "ci.yml")![1]; expect(ci).toMatch(/version: \d+\.\d+\.\d+\b/); expect(ci).not.toMatch(/version: latest/); });
  it("npm audit blocks on production dependencies and only reports on dev tooling", () => {
    const a = files.find(([f]) => f === "audit.yml")![1];
    expect(a).toContain("npm audit --omit=dev --audit-level=high");
    expect(a).toMatch(/continue-on-error: true\s*\n\s*run: npm audit --audit-level=high/);
    expect(a).toMatch(/schedule:\s*\n\s*- cron:/);                                                   // new advisories appear without code changes
  });
  it("CodeQL scans JavaScript/TypeScript with the security-extended suite, on a schedule too", () => {
    const c = files.find(([f]) => f === "codeql.yml")![1];
    expect(c).toContain("languages: javascript-typescript"); expect(c).toContain("queries: security-extended");
    expect(c).toMatch(/schedule:/);
  });
  it("Dependabot keeps both npm and the pinned actions current, weekly", () => {
    const d = readFileSync(".github/dependabot.yml", "utf8");
    expect(d).toMatch(/package-ecosystem: npm/); expect(d).toMatch(/package-ecosystem: github-actions/);
    expect((d.match(/interval: weekly/g) ?? []).length).toBe(2);
  });
});

describe("branch ruleset", () => {
  const rs = JSON.parse(readFileSync(".github/rulesets/main.json", "utf8"));
  const names = readdirSync(".github/workflows").flatMap((f) => [...readFileSync(`.github/workflows/${f}`, "utf8").matchAll(/^    name: (.+)$/gm)].map((m) => m[1].trim()));
  const rule = (t: string) => rs.rules.find((r: { type: string }) => r.type === t);
  it("requires exactly the checks that exist as jobs (a renamed job would otherwise block every merge forever)", () => {
    const required = rule("required_status_checks").parameters.required_status_checks.map((c: { context: string }) => c.context);
    expect(required.length).toBeGreaterThanOrEqual(4);
    for (const c of required) expect(names, c).toContain(c);
    for (const n of names) expect(required, `job "${n}" is not required`).toContain(n);
  });
  it("forbids deleting or force-pushing the default branch, demands pull requests and an up-to-date branch", () => {
    for (const t of ["deletion", "non_fast_forward", "required_linear_history", "pull_request"]) expect(rule(t), t).toBeTruthy();
    expect(rule("required_status_checks").parameters.strict_required_status_checks_policy).toBe(true);
    expect(rs.bypass_actors).toEqual([]); expect(rs.enforcement).toBe("active");
  });
});
