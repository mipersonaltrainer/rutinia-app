import { describe, it, expect } from "vitest";
import { checkPassword, PASSWORD_MIN, PASSWORD_MAX } from "@/lib/auth/password";
import { issueFormToken, verifyFormToken, honeypotFilled, MIN_FILL_MS, MAX_FILL_MS } from "@/lib/auth/antibot";
import { safeNext, signRecoveryMarker, verifyRecoveryMarker, RECOVERY_TTL_MS } from "@/lib/auth/recovery";
import { clientIp, throttleKey, limitFromEnv, rulesFor, tooMany, hit, blockedMessage } from "@/lib/auth/throttle";

describe("password policy", () => {
  const ok = (p: string, ctx = {}) => checkPassword(p, ctx).ok;
  const err = (p: string, ctx = {}) => { const r = checkPassword(p, ctx); return r.ok ? "" : r.error; };
  it("accepts a normal strong password", () => { expect(ok("Mañana-Soleada-42")).toBe(true); expect(ok("tres caballos 7 azules")).toBe(true); });
  it(`needs at least ${PASSWORD_MIN} characters`, () => { expect(ok("Abc12345")).toBe(false); expect(err("Abc1234567".slice(0, 9))).toMatch(/al menos 10/); expect(ok("Tigre98765")).toBe(true); });
  it("rejects more than 72 bytes (bcrypt would silently truncate) and counts bytes, not characters", () => {
    expect(ok("a1" + "b".repeat(PASSWORD_MAX - 2))).toBe(true); expect(ok("a1" + "b".repeat(PASSWORD_MAX - 1))).toBe(false);
    expect(ok("ñ1" + "ñ".repeat(35))).toBe(false);                                   // 37 characters but 74 bytes
  });
  it("needs both letters and digits", () => { expect(err("solo letras largas")).toMatch(/letras y números/); expect(err("12345678901234")).toMatch(/letras y números/); });
  it("rejects repeated characters and well-known passwords, whatever the case", () => { expect(ok("aaaaaaaaaaaa")).toBe(false); expect(err("Password123")).toMatch(/común/); expect(err("CONTRASEÑA123")).toMatch(/común/); });
  it("refuses the e-mail's local part or the first name inside the password", () => {
    expect(err("maria.lopez-2026", { email: "maria.lopez@x.co" })).toMatch(/correo/); expect(ok("maria.lopez-2026", { email: "ml@x.co" })).toBe(true);
    expect(err("Valentina-2026-ok", { fullName: "Valentina Ruiz" })).toMatch(/nombre/);
    expect(ok("abc-2026-xyz1", { email: "abc@x.co" })).toBe(true);                    // a 3-letter local part is too short to be meaningful
  });
  it("non-strings are refused", () => expect(checkPassword(undefined as unknown as string).ok).toBe(false));
});

describe("antibot form token", () => {
  const S = "server-secret-A"; const T0 = 1_800_000_000_000;
  const tok = issueFormToken(S, T0);
  it("is accepted after the minimum fill time and before it expires", () => { expect(verifyFormToken(S, tok, T0 + MIN_FILL_MS).ok).toBe(true); expect(verifyFormToken(S, tok, T0 + MAX_FILL_MS).ok).toBe(true); });
  it("a submit that is too fast (a script) is refused", () => expect(verifyFormToken(S, tok, T0 + MIN_FILL_MS - 1)).toEqual({ ok: false, reason: "too_fast" }));
  it("an old form is refused", () => expect(verifyFormToken(S, tok, T0 + MAX_FILL_MS + 1)).toEqual({ ok: false, reason: "expired" }));
  it("missing, malformed and forged tokens are refused", () => {
    expect(verifyFormToken(S, undefined, T0 + 5000).ok).toBe(false); expect(verifyFormToken(S, "", T0 + 5000)).toMatchObject({ reason: "missing" });
    expect(verifyFormToken(S, "garbage", T0 + 5000)).toMatchObject({ reason: "malformed" });
    expect(verifyFormToken("another-secret", tok, T0 + 5000)).toMatchObject({ reason: "forged" });
    const [t, mac] = tok.split("."); expect(verifyFormToken(S, `${Number(t) - 100000}.${mac}`, T0 + 5000)).toMatchObject({ reason: "forged" });   // back-dating to dodge the minimum
  });
  it("the minimum can be tuned per deployment", () => { expect(verifyFormToken(S, tok, T0 + 500, { minMs: 300 }).ok).toBe(true); expect(verifyFormToken(S, tok, T0 + 200, { minMs: 300 }).ok).toBe(false); });
  it("honeypot: only a non-blank value counts", () => { expect(honeypotFilled("http://spam")).toBe(true); expect(honeypotFilled("  ")).toBe(false); expect(honeypotFilled("")).toBe(false); expect(honeypotFilled(null)).toBe(false); });
});

describe("safeNext (no open redirect)", () => {
  it("allows only the known internal paths and drops query strings", () => {
    expect(safeNext("/reset-password")).toBe("/reset-password"); expect(safeNext("/trainer?x=1#h")).toBe("/trainer"); expect(safeNext("/client")).toBe("/client");
  });
  it("everything else falls back", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "/admin", "/trainer/../../evil", "javascript:alert(1)", "evil.com", "", null, undefined, "/reset-password\n", "/" + "a".repeat(300)]) expect([bad, safeNext(bad as string)]).toEqual([bad, "/login"]);
    expect(safeNext("https://evil.com", "/trainer")).toBe("/trainer");
  });
});

describe("recovery marker", () => {
  const S = "server-secret-A"; const T0 = 1_800_000_000_000; const uid = "11111111-1111-1111-1111-111111111111";
  const m = signRecoveryMarker(S, uid, T0);
  it("is valid for its user for 15 minutes", () => { expect(verifyRecoveryMarker(S, uid, m, T0 + 1000)).toBe(true); expect(verifyRecoveryMarker(S, uid, m, T0 + RECOVERY_TTL_MS)).toBe(true); expect(verifyRecoveryMarker(S, uid, m, T0 + RECOVERY_TTL_MS + 1)).toBe(false); });
  it("is bound to the user: someone else's marker is useless", () => expect(verifyRecoveryMarker(S, "22222222-2222-2222-2222-222222222222", m, T0 + 1000)).toBe(false));
  it("cannot be forged, extended or come from the future", () => {
    expect(verifyRecoveryMarker("other", uid, m, T0 + 1000)).toBe(false);
    const [t, mac] = m.split("."); expect(verifyRecoveryMarker(S, uid, `${Number(t) + 600000}.${mac}`, T0 + RECOVERY_TTL_MS + 1000)).toBe(false);
    expect(verifyRecoveryMarker(S, uid, m, T0 - 1)).toBe(false);
    for (const junk of [undefined, null, "", "abc", "1.2"]) expect(verifyRecoveryMarker(S, uid, junk, T0)).toBe(false);
  });
});

describe("throttle helpers", () => {
  const h = (v: Record<string, string>) => ({ get: (n: string) => v[n.toLowerCase()] ?? null });
  it("takes the first X-Forwarded-For hop and rejects junk", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7"); expect(clientIp(h({ "x-real-ip": "2001:DB8::1" }))).toBe("2001:db8::1");
    expect(clientIp(h({ "x-vercel-forwarded-for": "198.51.100.9", "x-forwarded-for": "9.9.9.9" }))).toBe("198.51.100.9");     // the platform header wins over the spoofable one
    expect(clientIp(h({ "x-real-ip": "198.51.100.8", "x-forwarded-for": "9.9.9.9" }))).toBe("198.51.100.8");
    expect(clientIp(h({}))).toBe("unknown"); expect(clientIp(h({ "x-forwarded-for": "<script>" }))).toBe("unknown");
  });
  it("keys are deterministic, case-insensitive and never contain the raw e-mail or IP", () => {
    const a = throttleKey("s", "login:pair", ["203.0.113.7", "Ana@X.co"]), b = throttleKey("s", "login:pair", ["203.0.113.7", "ana@x.co"]);
    expect(a).toBe(b); expect(a).toMatch(/^[0-9a-f]{64}$/); expect(a).not.toContain("ana"); expect(a).not.toContain("203");
    expect(throttleKey("other", "login:pair", ["203.0.113.7", "ana@x.co"])).not.toBe(a); expect(throttleKey("s", "reset:email", ["ana@x.co"])).not.toBe(throttleKey("s", "signup:email", ["ana@x.co"]));
  });
  it("environment overrides must be positive integers; garbage keeps the default (never 'unlimited')", () => {
    expect(limitFromEnv({ AUTH_LIMIT_X: "7" }, "X", 3)).toBe(7);
    for (const bad of ["0", "-1", "abc", "1.5", "", "Infinity"]) expect(limitFromEnv({ AUTH_LIMIT_X: bad }, "X", 3)).toBe(3);
    expect(limitFromEnv({}, "X", 3)).toBe(3);
  });
  it("the limits are the documented ones, and a request with no usable IP shares a bucket with a bigger allowance", () => {
    const r = rulesFor("signup", { ip: "1.2.3.4", email: "a@x.co" }, {}); expect(r.map((x) => [x.name, x.limit, x.windowSeconds])).toEqual([["signup:ip", 30, 3600], ["signup:email", 3, 86400]]);
    expect(rulesFor("reset", { ip: "1.2.3.4", email: "a@x.co" }, {}).map((x) => x.limit)).toEqual([30, 3]);
    expect(rulesFor("login", { ip: "1.2.3.4", email: "a@x.co" }, {}).map((x) => [x.limit, x.windowSeconds])).toEqual([[10, 900], [200, 900]]);
    expect(rulesFor("signup", { ip: "unknown", email: "a@x.co" }, {})[0].limit).toBe(300);
    expect(rulesFor("change", { ip: "1.2.3.4", email: "a@x.co", userId: "u1" }, {})[0].parts).toEqual(["u1"]);
  });
  it("messages say how long to wait", () => { expect(tooMany(30)).toMatch(/1 min/); expect(tooMany(600)).toMatch(/10 min/); expect(tooMany(7200)).toMatch(/2 h/); });
  it("fails closed: if the limiter errors the attempt is refused", async () => {
    const broken = { rpc: async () => ({ data: null, error: { message: "down" } }) } as never;
    expect(await hit(broken, "s", rulesFor("login", { ip: "1.2.3.4", email: "a@x.co" }, {}))).toEqual({ allowed: false, retryAfterSeconds: 60, unavailable: true });
    expect(blockedMessage({ retryAfterSeconds: 60, unavailable: true })).not.toMatch(/Demasiados/);       // an outage is not presented as a limit
    expect(blockedMessage({ retryAfterSeconds: 600 })).toMatch(/Demasiados intentos.*10 min/);
  });
  it("reports the longest wait among the rules that refused", async () => {
    const answers = [{ allowed: false, retry_after: 120 }, { allowed: false, retry_after: 900 }]; let i = 0;
    const rpc = { rpc: async () => ({ data: answers[i++], error: null }) } as never;
    expect(await hit(rpc, "s", rulesFor("login", { ip: "1.2.3.4", email: "a@x.co" }, {}))).toEqual({ allowed: false, retryAfterSeconds: 900 });
  });
});

describe("anti-bot: what a person sees", () => {
  it("a real person who was too quick or left the page open is told to try again; scripts keep the neutral answer", async () => {
    const { retryMessage } = await import("@/lib/auth/antibot");
    expect(retryMessage({ ok: false, reason: "too_fast" })).toMatch(/vuelve a pulsar/); expect(retryMessage({ ok: false, reason: "expired" })).toMatch(/Recárgala/);
    for (const reason of ["missing", "malformed", "forged"] as const) expect(retryMessage({ ok: false, reason }), reason).toBeNull();
    expect(retryMessage({ ok: true })).toBeNull();
  });
});
