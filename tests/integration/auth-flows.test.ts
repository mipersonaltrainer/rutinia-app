// Requires local Supabase. Run: npm run test:int
import { describe, it, expect, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hit, clear, rulesFor, throttleKey } from "@/lib/auth/throttle";
import { verifyPassword } from "@/lib/privacy/reauth";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Date.now(); const OLD = "Vieja-Clave-2026", NEW = "Nueva-Clave-2026!"; const created: string[] = [];
const K = `it-${run}`;
async function user(tag: string) { const email = `auth-${tag}-${run}@x.co`; const { data, error } = await admin.auth.admin.createUser({ email, password: OLD, email_confirm: true }); if (error) throw error; created.push(data.user.id); return { id: data.user.id, email }; }
async function login(email: string, password = OLD): Promise<SupabaseClient> { const c = anon(); const { error } = await c.auth.signInWithPassword({ email, password }); if (error) throw error; return c; }
const raw = (key: string, limit: number, secs: number, c: SupabaseClient = admin) => c.rpc("auth_throttle_hit", { p_key: key, p_limit: limit, p_window_seconds: secs });

afterAll(async () => { await admin.from("auth_throttle").delete().like("key", `${K}%`); for (const id of created) await admin.auth.admin.deleteUser(id); });

describe("auth_throttle (database)", () => {
  it("only the service role can use it; the table is invisible to users", async () => {
    expect((await raw(`${K}-perm`, 3, 60, anon())).error).not.toBeNull();
    expect((await anon().rpc("auth_throttle_clear", { p_key: "x" })).error).not.toBeNull();
    expect((await anon().rpc("auth_throttle_purge")).error).not.toBeNull();
    expect((await anon().from("auth_throttle").select("key")).data ?? []).toEqual([]);
  });
  it("allows exactly `limit` attempts per window, then refuses with a wait time", async () => {
    const k = `${K}-limit`; const answers = [];
    for (let i = 0; i < 5; i++) answers.push((await raw(k, 3, 600)).data as { allowed: boolean; hits: number; retry_after: number });
    expect(answers.map((a) => a.allowed)).toEqual([true, true, true, false, false]);
    expect(answers[3].retry_after).toBeGreaterThan(0); expect(answers[3].retry_after).toBeLessThanOrEqual(600);
    expect(answers[2].retry_after).toBe(0);
  });
  it("starts a new window once the old one has elapsed", async () => {
    const k = `${K}-window`;
    for (let i = 0; i < 3; i++) await raw(k, 2, 60);
    expect(((await raw(k, 2, 60)).data as { allowed: boolean }).allowed).toBe(false);
    await admin.from("auth_throttle").update({ window_start: new Date(Date.now() - 61_000).toISOString() }).eq("key", k);
    expect((await raw(k, 2, 60)).data).toMatchObject({ allowed: true, hits: 1 });
  });
  it("keys are independent", async () => { await raw(`${K}-a`, 1, 60); await raw(`${K}-a`, 1, 60); expect(((await raw(`${K}-b`, 1, 60)).data as { allowed: boolean }).allowed).toBe(true); });
  it("25 concurrent attempts against a limit of 5: exactly 5 get through", async () => {
    const k = `${K}-race`; const rs = await Promise.all(Array.from({ length: 25 }, () => raw(k, 5, 600)));
    expect(rs.filter((r) => (r.data as { allowed: boolean }).allowed)).toHaveLength(5);
  });
  it("clear forgets the counter; purge removes only dead rows", async () => {
    const k = `${K}-clear`; await raw(k, 1, 600); await raw(k, 1, 600); await admin.rpc("auth_throttle_clear", { p_key: k });
    expect(((await raw(k, 1, 600)).data as { allowed: boolean }).allowed).toBe(true);
    const old = `${K}-old`, fresh = `${K}-fresh`; await raw(old, 5, 60); await raw(fresh, 5, 60);
    await admin.from("auth_throttle").update({ window_start: new Date(Date.now() - 3 * 86400_000).toISOString() }).eq("key", old);
    const { data: n } = await admin.rpc("auth_throttle_purge"); expect(n).toBeGreaterThanOrEqual(1);
    expect((await admin.from("auth_throttle").select("key").in("key", [old, fresh])).data!.map((r) => r.key)).toEqual([fresh]);
  });
  it("rejects nonsense parameters", async () => { expect((await raw(`${K}-bad`, 0, 60)).error).not.toBeNull(); expect((await raw(`${K}-bad`, 3, 0)).error).not.toBeNull(); });

  it("the TypeScript helper: per-account rule trips before the per-IP one, and success clears only the account counter", async () => {
    const ip = `10.${run % 250}.0.1`, email = `pair-${run}@x.co`; const rules = rulesFor("login", { ip, email }, { AUTH_LIMIT_LOGIN_PAIR: "3", AUTH_LIMIT_LOGIN_IP: "100" });
    const results = []; for (let i = 0; i < 5; i++) results.push((await hit(admin, K, rules)).allowed);
    expect(results).toEqual([true, true, true, false, false]);
    const blocked = await hit(admin, K, rules); expect(blocked.allowed).toBe(false); if (!blocked.allowed) expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    await clear(admin, K, rules.slice(0, 1));
    expect((await hit(admin, K, rules)).allowed).toBe(true);
    // The table holds only digests.
    const keys = (await admin.from("auth_throttle").select("key").in("key", rules.map((r) => throttleKey(K, r.name, r.parts)))).data!;
    expect(keys.length).toBe(2); for (const { key } of keys) { expect(key).toMatch(/^[0-9a-f]{64}$/); }
    await admin.from("auth_throttle").delete().in("key", keys.map((k) => k.key));
  });
});

describe("password flows against the real Auth service", () => {
  it("re-authenticating (verifyPassword) does not sign the user out anywhere", async () => {
    const u = await user("reauth"); const A = await login(u.email), B = await login(u.email);
    expect(await verifyPassword(u.email, OLD)).toBe(true);
    expect(await verifyPassword(u.email, "otra-clave-9999")).toBe(false);
    expect((await A.auth.getUser()).error).toBeNull(); expect((await B.auth.getUser()).error).toBeNull();
  });

  it("changing the password and signing out 'others' kills the other device's session immediately", async () => {
    const u = await user("change"); const A = await login(u.email), B = await login(u.email);
    expect((await B.auth.getUser()).error).toBeNull();
    expect((await A.auth.updateUser({ password: NEW })).error).toBeNull();
    expect((await A.auth.signOut({ scope: "others" })).error).toBeNull();
    expect((await B.auth.getUser()).error).not.toBeNull();                                  // the stolen/forgotten session stops working
    expect((await B.auth.refreshSession()).error).not.toBeNull();
    expect((await A.auth.getUser()).error).toBeNull();                                      // the device that made the change stays signed in
    expect((await anon().auth.signInWithPassword({ email: u.email, password: OLD })).error).not.toBeNull();
    expect((await anon().auth.signInWithPassword({ email: u.email, password: NEW })).error).toBeNull();
  });

  it("a recovery token_hash (the shape /auth/confirm verifies) signs in once, then is dead", async () => {
    const u = await user("recovery");
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: u.email }); expect(error).toBeNull();
    const hash = data.properties!.hashed_token;
    const R = anon(); const first = await R.auth.verifyOtp({ token_hash: hash, type: "recovery" });
    expect(first.error).toBeNull(); expect(first.data.user?.id).toBe(u.id); expect(first.data.session).not.toBeNull();
    expect((await anon().auth.verifyOtp({ token_hash: hash, type: "recovery" })).error).not.toBeNull();       // single use
    expect((await anon().auth.verifyOtp({ token_hash: "0".repeat(56), type: "recovery" })).error).not.toBeNull();   // garbage
    expect((await R.auth.updateUser({ password: NEW })).error).toBeNull();
    expect((await anon().auth.signInWithPassword({ email: u.email, password: NEW })).error).toBeNull();
  });

  it("a recovery hash cannot be replayed as another type", async () => {
    const u = await user("type");
    const { data } = await admin.auth.admin.generateLink({ type: "recovery", email: u.email });
    expect((await anon().auth.verifyOtp({ token_hash: data.properties!.hashed_token, type: "signup" })).error).not.toBeNull();
  });

  it("after a reset, global sign-out ends every session and only the new password works", async () => {
    const u = await user("global"); const A = await login(u.email), B = await login(u.email);
    expect((await A.auth.updateUser({ password: NEW })).error).toBeNull();
    expect((await A.auth.signOut({ scope: "global" })).error).toBeNull();
    expect((await B.auth.getUser()).error).not.toBeNull(); expect((await A.auth.getUser()).error).not.toBeNull();
    expect((await anon().auth.signInWithPassword({ email: u.email, password: OLD })).error).not.toBeNull();
    expect((await anon().auth.signInWithPassword({ email: u.email, password: NEW })).error).toBeNull();
  });

  it("asking for a link for an address that does not exist looks identical to one that does", async () => {
    const real = await user("enum");
    const a = await anon().auth.resetPasswordForEmail(real.email), b = await anon().auth.resetPasswordForEmail(`nobody-${run}@x.co`);
    expect(a.error?.status).toBe(b.error?.status); expect(a.error?.code).toBe(b.error?.code);   // both succeed (or both fail the same way): no oracle
  });
});
