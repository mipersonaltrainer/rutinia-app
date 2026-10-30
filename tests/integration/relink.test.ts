// Requires local Supabase. Re-linking: a client who already has an account (e.g. ended a relationship) comes back through a NEW invitation,
// signed in as themselves, confirming their consents. The token alone must never give access to an existing account.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateInviteToken, hashInviteToken } from "@/lib/invitations";
import { relinkExistingClient } from "@/lib/invitations/relink";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
const ALL = { personal_data: true, health_data: true, share_with_trainer: true };
async function mk(email: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
async function invite(trainer: string, email: string, extra: Record<string, unknown> = {}) {
  const token = generateInviteToken(); const { error } = await admin.from("invitations").insert({ trainer_id: trainer, email, full_name: "Alumno", token_hash: hashInviteToken(token), ...extra }); if (error) throw error; return token;
}
const rel = async (t: string, c: string) => (await admin.from("trainer_client_relationships").select("status,archived_by").eq("trainer_id", t).eq("client_id", c).maybeSingle()).data;
const inv = async (token: string) => (await admin.from("invitations").select("status,accepted_by").eq("token_hash", hashInviteToken(token)).single()).data!;
const consentsOf = async (u: string) => (await admin.from("consents").select("type,revoked_at").eq("user_id", u)).data ?? [];

let t1: string, t2: string, c1: string, c1Email: string, T1: SupabaseClient;
beforeAll(async () => {
  t1 = await mk(`rl-t1-${run}@x.co`); t2 = await mk(`rl-t2-${run}@x.co`); c1Email = `rl-c1-${run}@x.co`; c1 = await mk(c1Email, true);
  T1 = await login(`rl-t1-${run}@x.co`);
});
afterAll(async () => { for (const id of created) await admin.auth.admin.deleteUser(id); });

// each scenario starts from: the client once belonged to t1, ended it (archived_by = client) and revoked sharing
async function reset() {
  await admin.from("trainer_client_relationships").delete().eq("client_id", c1);
  await admin.from("trainer_client_relationships").insert({ trainer_id: t1, client_id: c1, status: "archived", archived_by: "client" });
  await admin.from("consents").delete().eq("user_id", c1);
  await admin.from("consents").insert([{ user_id: c1, type: "personal_data" }, { user_id: c1, type: "health_data", revoked_at: new Date().toISOString() }, { user_id: c1, type: "share_with_trainer", revoked_at: new Date().toISOString() }]);
  await admin.from("invitations").delete().eq("trainer_id", t1).ilike("email", c1Email);
}
const go = (token: string, over: Partial<Parameters<typeof relinkExistingClient>[1]> = {}) => relinkExistingClient(admin, { userId: c1, userEmail: c1Email, tokenHash: hashInviteToken(token), consents: ALL, ...over });

describe("the invitation context is private", () => {
  it("only the service role can read it; users and anonymous callers cannot", async () => {
    const token = await invite(t1, c1Email); const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    expect((await anon.rpc("invitation_context", { p_hash: hashInviteToken(token) })).error).not.toBeNull();
    expect((await T1.rpc("invitation_context", { p_hash: hashInviteToken(token) })).error).not.toBeNull();
    const ok = await admin.rpc("invitation_context", { p_hash: hashInviteToken(token) }); expect(ok.error).toBeNull(); expect(ok.data![0]).toMatchObject({ account_id: c1, account_role: "client", usable: true });
    await reset();
  });
  it("an unknown token reveals nothing", async () => {
    const r = await admin.rpc("invitation_context", { p_hash: hashInviteToken("no-existe") }); expect(r.data).toEqual([]);
  });
});

describe("re-linking an existing client", () => {
  it("the client who ended the relationship returns with a new invitation, confirms the consents, and the trainer regains access", async () => {
    await reset(); const token = await invite(t1, c1Email);
    expect((await T1.rpc("can_access_client", { c: c1 })).data).toBe(false);
    const r = await go(token); expect(r).toMatchObject({ ok: true, trainerId: t1 });
    expect(await rel(t1, c1)).toEqual({ status: "active", archived_by: null });
    expect((await consentsOf(c1)).filter((c) => !c.revoked_at).map((c) => c.type).sort()).toEqual(["health_data", "personal_data", "share_with_trainer"]);
    expect(await inv(token)).toMatchObject({ status: "accepted", accepted_by: c1 });
    expect((await T1.rpc("can_access_client", { c: c1 })).data).toBe(true);
  });
  it("works for a trainer the client never had before", async () => {
    await reset(); await admin.from("trainer_client_relationships").delete().eq("client_id", c1);
    const token = await invite(t2, c1Email); expect((await go(token)).ok).toBe(true); expect(await rel(t2, c1)).toEqual({ status: "active", archived_by: null });
    await admin.from("trainer_client_relationships").delete().eq("client_id", c1);
  });
  it("all three consents are required; without them nothing changes and the invitation stays usable", async () => {
    await reset(); const token = await invite(t1, c1Email);
    for (const missing of ["personal_data", "health_data", "share_with_trainer"] as const) {
      const r = await go(token, { consents: { ...ALL, [missing]: false } }); expect(r).toMatchObject({ ok: false, code: "no_consent" });
    }
    expect(await rel(t1, c1)).toEqual({ status: "archived", archived_by: "client" }); expect((await inv(token)).status).toBe("pending");
    expect((await consentsOf(c1)).filter((c) => !c.revoked_at).map((c) => c.type)).toEqual(["personal_data"]);
  });
  it("the token alone is not enough: it must be the signed-in owner of that e-mail address", async () => {
    await reset(); const token = await invite(t1, c1Email);
    const other = await mk(`rl-other-${run}@x.co`, true);
    expect(await go(token, { userId: other, userEmail: `rl-other-${run}@x.co` })).toMatchObject({ ok: false, code: "wrong_account" });
    expect(await go(token, { userId: other, userEmail: c1Email })).toMatchObject({ ok: false, code: "wrong_account" });          // claiming the right e-mail with the wrong identity
    expect(await go(token, { userEmail: `RL-C1-${run}@X.CO` })).toMatchObject({ ok: true });                                      // case-insensitive e-mail comparison for the real owner
    expect(await rel(t1, other)).toBeNull();
  });
  it("a trainer account cannot be re-linked as a client", async () => {
    await reset(); const token = await invite(t1, `rl-t2-${run}@x.co`);
    expect(await go(token, { userId: t2, userEmail: `rl-t2-${run}@x.co` })).toMatchObject({ ok: false, code: "not_client" });
    expect(await rel(t1, t2)).toBeNull(); expect((await inv(token)).status).toBe("pending");
  });
  it("a client who already has another active trainer must end that relationship first; the invitation is not consumed", async () => {
    await reset(); await admin.from("trainer_client_relationships").insert({ trainer_id: t2, client_id: c1 });
    const token = await invite(t1, c1Email);
    expect(await go(token)).toMatchObject({ ok: false, code: "other_trainer" });
    expect(await rel(t1, c1)).toEqual({ status: "archived", archived_by: "client" }); expect((await inv(token)).status).toBe("pending");
    await admin.from("trainer_client_relationships").delete().eq("trainer_id", t2).eq("client_id", c1);
  });
  it("expired, revoked and already used invitations are refused", async () => {
    await reset();
    const expired = await invite(t1, c1Email, { expires_at: new Date(Date.now() - 1000).toISOString() }); expect(await go(expired)).toMatchObject({ ok: false, code: "invalid" });
    await admin.from("invitations").delete().eq("trainer_id", t1).ilike("email", c1Email);
    const revoked = await invite(t1, c1Email); await T1.from("invitations").update({ status: "revoked" }).eq("token_hash", hashInviteToken(revoked)); expect(await go(revoked)).toMatchObject({ ok: false, code: "invalid" });
    await admin.from("invitations").delete().eq("trainer_id", t1).ilike("email", c1Email);
    const once = await invite(t1, c1Email); expect((await go(once)).ok).toBe(true); expect(await go(once)).toMatchObject({ ok: false, code: "invalid" });
    expect(await go("token-inventado")).toMatchObject({ ok: false, code: "invalid" });
  });
  it("a trainer at capacity cannot be linked; the invitation is released and the client's state is unchanged", async () => {
    await reset(); const fillers: string[] = [];
    for (let i = 0; i < 20; i++) fillers.push(await mk(`rl-f${i}-${run}@x.co`, true));
    await admin.from("trainer_client_relationships").insert(fillers.map((f) => ({ trainer_id: t2, client_id: f })));
    const token = await invite(t2, c1Email); const r = await go(token); expect(r).toMatchObject({ ok: false, code: "capacity" });
    expect(await rel(t2, c1)).toBeNull(); expect((await inv(token)).status).toBe("pending");
    expect((await consentsOf(c1)).filter((c) => !c.revoked_at).map((c) => c.type)).toEqual(["personal_data"]);          // consents untouched when the link fails
    await admin.from("trainer_client_relationships").delete().eq("trainer_id", t2);
  });
});
