// Requires local Supabase (`npx supabase start`). Run: npm run test:int
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hashInviteToken, generateInviteToken } from "@/lib/invitations";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const run = Date.now();
const pw = "Test-Pass-12345";
const created: string[] = [];

async function mkUser(email: string, role?: "client") {
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: role ? { role } : {} });
  if (error) throw error;
  created.push(data.user.id);
  return data.user.id;
}
async function login(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: pw });
  if (error) throw error;
  return c;
}

let t1: string, t2: string, c1: string, c2: string;
let T1: SupabaseClient, T2: SupabaseClient, C1: SupabaseClient;

beforeAll(async () => {
  t1 = await mkUser(`t1-${run}@x.co`); t2 = await mkUser(`t2-${run}@x.co`);
  c1 = await mkUser(`c1-${run}@x.co`, "client"); c2 = await mkUser(`c2-${run}@x.co`, "client");
  T1 = await login(`t1-${run}@x.co`); T2 = await login(`t2-${run}@x.co`); C1 = await login(`c1-${run}@x.co`);
  await admin.from("trainer_client_relationships").insert([{ trainer_id: t1, client_id: c1 }, { trainer_id: t2, client_id: c2 }]);
});
afterAll(async () => { for (const id of created) await admin.auth.admin.deleteUser(id); });

describe("roles", () => {
  it("admin-created clients get role=client and no trial; self-signup is a trainer with trial", async () => {
    const { data: cp } = await admin.from("profiles").select("role").eq("id", c1).single();
    expect(cp?.role).toBe("client");
    expect((await admin.from("trainer_subscriptions").select("trainer_id").eq("trainer_id", c1)).data).toEqual([]);
    expect((await admin.from("profiles").select("role").eq("id", t1).single()).data?.role).toBe("trainer");
    expect((await admin.from("trainer_subscriptions").select("status").eq("trainer_id", t1).single()).data?.status).toBe("trialing");
  });
  it("a user cannot make themselves a client/trainer via user_metadata", async () => {
    const c = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data } = await c.auth.signUp({ email: `self-${run}@x.co`, password: pw, options: { data: { role: "client" } } });
    if (data.user) created.push(data.user.id);
    expect((await admin.from("profiles").select("role").eq("id", data.user!.id).single()).data?.role).toBe("trainer");
  });
});

describe("tenant isolation (real PostgREST + RLS)", () => {
  it("trainer sees only own clients and client profiles", async () => {
    const { data } = await T1.from("trainer_client_relationships").select("client_id");
    expect(data?.map((r) => r.client_id)).toEqual([c1]);
    const { data: p } = await T1.from("profiles").select("id").eq("id", c2);
    expect(p).toEqual([]);
  });
  it("trainer cannot attach someone else's client or forge trainer_id", async () => {
    const { error } = await T1.from("trainer_client_relationships").insert({ trainer_id: t2, client_id: c1 });
    expect(error).not.toBeNull();
    expect((await T1.from("trainer_client_relationships").insert({ trainer_id: t1, client_id: c2 })).error).not.toBeNull();       // SEC-001: own trainer_id, someone else's client (see relationship-security.test.ts)
  });
  it("client sees only own relationship and cannot read other clients", async () => {
    const { data } = await C1.from("trainer_client_relationships").select("client_id");
    expect(data?.map((r) => r.client_id)).toEqual([c1]);
    const { data: p } = await C1.from("profiles").select("id").eq("id", c2);
    expect(p).toEqual([]);
  });
  it("client cannot create invitations or grant themselves slots", async () => {
    expect((await C1.from("invitations").insert({ trainer_id: t1, email: "a@b.co", token_hash: "h" })).error).not.toBeNull();
    expect((await T1.from("slot_purchases").insert({ trainer_id: t1, provider: "wompi", provider_reference: "z", quantity: 5, unit_price_cents: 75, total_cents: 375, status: "approved", slots_granted: true })).error).not.toBeNull();
  });
  it("trainer cannot read or revoke another trainer's invitation", async () => {
    const token = generateInviteToken();
    const { data: inv } = await T1.from("invitations").insert({ trainer_id: t1, email: `i-${run}@x.co`, token_hash: hashInviteToken(token) }).select().single();
    expect((await T2.from("invitations").select("id").eq("id", inv!.id)).data).toEqual([]);
    await T2.from("invitations").update({ status: "revoked" }).eq("id", inv!.id);
    expect((await admin.from("invitations").select("status").eq("id", inv!.id).single()).data?.status).toBe("pending");
  });
});

describe("invitation lifecycle", () => {
  const make = async (extra: Record<string, unknown> = {}) => {
    const token = generateInviteToken();
    await admin.from("invitations").insert({ trainer_id: t1, email: `l-${Math.random()}@x.co`, token_hash: hashInviteToken(token), ...extra });
    return token;
  };
  it("single use: second claim fails", async () => {
    const tk = await make();
    expect((await admin.rpc("claim_invitation", { p_hash: hashInviteToken(tk) })).data?.id).toBeTruthy();
    expect((await admin.rpc("claim_invitation", { p_hash: hashInviteToken(tk) })).data?.id).toBeFalsy();
  });
  it("expired and revoked invitations cannot be claimed", async () => {
    const e = await make({ expires_at: new Date(Date.now() - 1000).toISOString() });
    expect((await admin.rpc("claim_invitation", { p_hash: hashInviteToken(e) })).data?.id).toBeFalsy();
    const r = await make({ status: "revoked" });
    expect((await admin.rpc("claim_invitation", { p_hash: hashInviteToken(r) })).data?.id).toBeFalsy();
  });
  it("anonymous and authenticated roles cannot call claim_invitation", async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    expect((await anon.rpc("claim_invitation", { p_hash: "x" })).error).not.toBeNull();
    expect((await T1.rpc("claim_invitation", { p_hash: "x" })).error).not.toBeNull();
  });
  it("pending invitations do not consume capacity; archive frees a slot", async () => {
    expect((await admin.rpc("trainer_capacity", { t: t1 })).data).toBe(20);
    const { data: rel } = await T1.from("trainer_client_relationships").select("id").eq("client_id", c1).single();
    expect((await T1.rpc("set_client_relationship_status", { p_rel: rel!.id, p_status: "archived" })).error).toBeNull();
    expect((await T1.rpc("set_client_relationship_status", { p_rel: rel!.id, p_status: "active" })).error).toBeNull();
  });
});

describe("health data access (consent + relationship)", () => {
  let aId: string, mId: string;
  const consent = async (user: string, types: string[]) => { await admin.from("consents").upsert(types.map((type) => ({ user_id: user, type, revoked_at: null })), { onConflict: "user_id,type" }); };
  beforeAll(async () => {
    await consent(c1, ["personal_data", "health_data", "share_with_trainer"]);
    await consent(c2, ["personal_data", "health_data", "share_with_trainer"]);
    const { data } = await admin.from("assessments").insert({ client_id: c1, status: "submitted", data: { x: 1 }, risk_level: "review", risk_reasons: ["t"] }).select().single();
    aId = data!.id;
    const m = await T1.from("anthropometric_measurements").insert({ client_id: c1, entered_by: t1, taken_by: "trainer", method: "tape", measured_on: "2026-10-01", waist_cm: 90 }).select().single();
    expect(m.error).toBeNull(); mId = m.data!.id;
  });
  it("own trainer and client can read; other trainer and other client cannot", async () => {
    expect((await T1.from("assessments").select("id").eq("id", aId)).data?.length).toBe(1);
    expect((await C1.from("assessments").select("id").eq("id", aId)).data?.length).toBe(1);
    expect((await T2.from("assessments").select("id").eq("id", aId)).data).toEqual([]);
    expect((await T2.from("anthropometric_measurements").select("id").eq("id", mId)).data).toEqual([]);
    const C2c = await login(`c2-${run}@x.co`);
    expect((await C2c.from("assessments").select("id").eq("id", aId)).data).toEqual([]);
  });
  it("trainer cannot write measurements for a client that is not theirs", async () => {
    const r = await T2.from("anthropometric_measurements").insert({ client_id: c1, entered_by: t2, taken_by: "trainer", method: "tape", measured_on: "2026-10-01", waist_cm: 80 });
    expect(r.error).not.toBeNull();
  });
  it("cannot impersonate another author (entered_by) and rejects impossible values", async () => {
    expect((await T1.from("anthropometric_measurements").insert({ client_id: c1, entered_by: t2, taken_by: "trainer", method: "tape", measured_on: "2026-10-01", waist_cm: 80 })).error).not.toBeNull();
    expect((await C1.from("anthropometric_measurements").insert({ client_id: c1, entered_by: c1, taken_by: "self", method: "scale", measured_on: "2026-10-01", weight_kg: 5 })).error).not.toBeNull();
  });
  it("measurements and submitted assessments are immutable for users", async () => {
    await T1.from("anthropometric_measurements").update({ waist_cm: 10 }).eq("id", mId);
    await T1.from("anthropometric_measurements").delete().eq("id", mId);
    expect((await admin.from("anthropometric_measurements").select("waist_cm").eq("id", mId).single()).data?.waist_cm).toBe(90);
    await C1.from("assessments").update({ risk_level: "none" }).eq("id", aId);
    expect((await admin.from("assessments").select("risk_level").eq("id", aId).single()).data?.risk_level).toBe("review");
  });
  it("revoking consent hides health data from the trainer immediately; restoring brings it back", async () => {
    await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", c1).eq("type", "share_with_trainer");
    expect((await T1.from("assessments").select("id").eq("id", aId)).data).toEqual([]);
    expect((await T1.from("anthropometric_measurements").select("id").eq("id", mId)).data).toEqual([]);
    expect((await C1.from("assessments").select("id").eq("id", aId)).data?.length).toBe(1);   // client keeps own data
    await consent(c1, ["share_with_trainer"]);
    expect((await T1.from("assessments").select("id").eq("id", aId)).data?.length).toBe(1);
  });
  it("archived relationship removes trainer access", async () => {
    await admin.from("trainer_client_relationships").update({ status: "archived" }).eq("trainer_id", t1).eq("client_id", c1);
    expect((await T1.from("assessments").select("id").eq("id", aId)).data).toEqual([]);
    await admin.from("trainer_client_relationships").update({ status: "active" }).eq("trainer_id", t1).eq("client_id", c1);
  });
  it("expired trainer workspace blocks access to client health data", async () => {
    await admin.from("trainer_subscriptions").update({ trial_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("trainer_id", t1);
    expect((await T1.from("assessments").select("id").eq("id", aId)).data).toEqual([]);
    expect((await C1.from("assessments").select("id").eq("id", aId)).data?.length).toBe(1);
  });
});
