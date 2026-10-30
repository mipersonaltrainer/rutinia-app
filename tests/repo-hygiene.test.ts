import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

// Guards what is about to be published: no secrets, no personal paths, no env files, no oversized blobs.
// It looks at every file git would commit (tracked + new-and-not-ignored), so a mistake is caught before `git add`/push.
const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).toString().split("\0").filter(Boolean);
const text = (f: string): string | null => { try { const b = readFileSync(f); return b.includes(0) ? null : b.toString("utf8"); } catch { return null; } };
const SELF = "tests/repo-hygiene.test.ts";

// High-confidence formats only: a hit here is a real credential, not a variable name.
const SECRET_PATTERNS: [string, RegExp][] = [
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["JWT", /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{10,}/],
  ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{10,}/],
  ["OpenAI-style key", /\bsk-[A-Za-z0-9]{32,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}/],
  ["live Wompi key", /\b(prv|pub)_(prod|live)_[A-Za-z0-9]{8,}/],
  ["database URL with password", /postgres(ql)?:\/\/[^\s"'@]+:[^\s"'@]+@/],
  ["Slack/Discord webhook", /hooks\.slack\.com\/services\/T[A-Z0-9]{8,}\/B[A-Z0-9]{8,}\/[A-Za-z0-9]{16,}|discord(app)?\.com\/api\/webhooks\/\d{10,}\/[\w-]{30,}/],
];

describe("repository hygiene", () => {
  it("has files to check (the test is not vacuous)", () => expect(files.length).toBeGreaterThan(100));

  it("contains no credentials in any publishable file", () => {
    const hits: string[] = [];
    for (const f of files) {
      if (f === SELF || f === "package-lock.json") continue;
      const t = text(f); if (t === null) continue;
      for (const [name, re] of SECRET_PATTERNS) if (re.test(t)) hits.push(`${f}: ${name}`);
    }
    expect(hits).toEqual([]);
  });

  it("every secret pattern can actually match (a typo would silently disable the guard)", () => {
    const samples: Record<string, string> = {
      "private key block": "-----BEGIN RSA PRIVATE KEY-----", JWT: "eyJhbGciOiJIUzI1NiJ9aaaaaa.eyJzdWIiOiIxMjM0NTY3ODkwIn0aaaa.abcdefghijk1234",
      "Supabase secret key": "sb_secret_abcdefghij12", "Anthropic key": "sk-ant-abcdefghij12", "OpenAI-style key": "sk-" + "a".repeat(40),
      "AWS access key": "AKIA" + "A".repeat(16), "GitHub token": "ghp_" + "a".repeat(36), "Slack token": "xoxb-1234567890-abc", "Google API key": "AIza" + "a".repeat(35),
      "live Wompi key": "prv_prod_abcdefgh12", "database URL with password": "postgresql://user:pass@host/db",
      "Slack/Discord webhook": "hooks.slack.com/services/T0123456789/B0123456789/abcdefghijklmnop1234",
    };
    for (const [name, re] of SECRET_PATTERNS) expect(re.test(samples[name]), name).toBe(true);
  });

  it("commits no environment file except the documented template", () => {
    expect(files.filter((f) => /(^|\/)\.env/.test(f))).toEqual([".env.example"]);
  });

  it("the template holds placeholders, never working values", () => {
    const t = readFileSync(".env.example", "utf8");
    for (const line of t.split("\n").filter((l) => /^[A-Z_]+=/.test(l))) {
      const v = line.split("=").slice(1).join("=").replace(/\s+#.*$/, "").trim();
      expect(v.length < 40 || /^(https?:|your-|long-random|server-only)/.test(v), `${line.split("=")[0]} looks like a real value`).toBe(true);
    }
  });

  it("has no personal absolute paths or machine names", () => {
    const hits = files.filter((f) => f !== SELF && f !== "package-lock.json").flatMap((f) => { const t = text(f); return t && /\/Users\/[a-z][\w.-]*\/|MacBook-Air|\.local>/.test(t) ? [f] : []; });
    expect(hits).toEqual([]);
  });

  it("has no oversized files (a dump or video slipped in)", () => {
    expect(files.filter((f) => statSync(f).size > 3 * 1024 * 1024)).toEqual([]);
  });

  it("ignores what must never be published", () => {
    const ig = readFileSync(".gitignore", "utf8");
    for (const must of ["/node_modules", "/.next/", ".env*", "!.env.example", "/playwright-report/", "/test-results/", "*.pem", "*.tsbuildinfo"]) expect(ig, must).toContain(must);
    for (const f of [".env.local", "node_modules/x", "test-results/x", "playwright-report/index.html", "server.pem"]) {
      expect(() => execFileSync("git", ["check-ignore", "-q", f]), f).not.toThrow();
    }
  });

  it("declares its licensing state explicitly until one is chosen", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const hasLicenseFile = files.some((f) => /^LICENSE(\.|$)/i.test(f));
    // Either an explicit LICENSE file together with a matching SPDX id, or UNLICENSED (all rights reserved) with no LICENSE file.
    expect(hasLicenseFile ? pkg.license !== "UNLICENSED" : pkg.license === "UNLICENSED").toBe(true);
  });
});
