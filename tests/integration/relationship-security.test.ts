// Requires local Supabase. Regression tests for the security audit findings SEC-001 (relationship forgery / unilateral reactivation) and SEC-002 (self-editable role).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "Nombre Original" }, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
const rel = async (t: string, c: string) => (await admin.from("trainer_client_relationships").select("id,status,archived_by").eq("trainer_id", t).eq("client_id", c).maybeSingle()).data;

let t1: string, t2: string, c1: string, c2: string, T1: SupabaseClient, T2: SupabaseClient, C1: SupabaseClient, C2: SupabaseClient;
beforeAll(async () => {
  t1 = await mk(`rs-t1-${run}@x.co`); t2 = await mk(`rs-t2-${run}@x.co`); c1 = await mk(`rs-c1-${run}@x.co`, true); c2 = await mk(`rs-c2-${run}@x.co`, true);
  await admin.from("trainer_client_relationships").insert([{ trainer_id: t1, client_id: c1 }, { trainer_id: t2, client_id: c2 }]);
  await admin.from("consents").insert([c1, c2].flatMap((u) => ["personal_data", "health_data", "share_with_trainer"].map((type) => ({ user_id: u, type }))));
  await admin.from("anthropometric_measurements").insert({ client_id: c2, entered_by: c2, taken_by: "self", method: "scale", measured_on: "2026-10-01", weight_kg: 70, height_cm: 170 });
  T1 = await login(`rs-t1-${run}@x.co`); T2 = await login(`rs-t2-${run}@x.co`); C1 = await login(`rs-c1-${run}@x.co`); C2 = await login(`rs-c2-${run}@x.co`);
});
afterAll(async () => { for (const id of created) await admin.auth.admin.deleteUser(id); });

describe("SEC-001: a trainer cannot attach themselves to a client they were not given", () => {
  it("cannot insert a relationship with another trainer's client, and therefore reads nothing of theirs", async () => {
    const r = await T1.from("trainer_client_relationships").insert({ trainer_id: t1, client_id: c2 });
    expect(r.error, "inserting {self, someone else's client} must be refused").not.toBeNull();
    expect(await rel(t1, c2)).toBeNull();
    expect((await T1.from("anthropometric_measurements").select("id").eq("client_id", c2)).data).toEqual([]);
    expect((await T1.rpc("can_access_client", { c: c2 })).data).toBe(false);
  });
  it("cannot message the forged client either", async () => {
    expect((await T1.rpc("send_message", { p_peer: c2, p_body: "hola" })).error).not.toBeNull();
  });
  it("cannot rewrite the client of its own relationship, nor edit it directly at all", async () => {
    const own = await rel(t1, c1);
    await T1.from("trainer_client_relationships").update({ client_id: c2 }).eq("id", own!.id);
    expect((await rel(t1, c2))).toBeNull(); expect((await rel(t1, c1))!.id).toBe(own!.id);
    await T1.from("trainer_client_relationships").update({ status: "archived" }).eq("id", own!.id);
    expect((await rel(t1, c1))!.status, "status changes must go through the function").toBe("active");
    expect((await T1.from("trainer_client_relationships").delete().eq("id", own!.id)).error ?? null).toBeDefined();
    expect(await rel(t1, c1)).not.toBeNull();
  });
  it("a client cannot edit relationships directly either", async () => {
    const own = await rel(t1, c1);
    await C1.from("trainer_client_relationships").update({ status: "archived" }).eq("id", own!.id); expect((await rel(t1, c1))!.status).toBe("active");
    expect((await C1.from("trainer_client_relationships").insert({ trainer_id: t2, client_id: c1 })).error).not.toBeNull();
  });
});

describe("SEC-001: archiving and reactivating", () => {
  it("the trainer can archive, and reactivate their own client while nobody else has them", async () => {
    const own = (await rel(t1, c1))!;
    expect((await T1.rpc("set_client_relationship_status", { p_rel: own.id, p_status: "archived" })).error).toBeNull(); expect((await rel(t1, c1))!.status).toBe("archived"); expect((await rel(t1, c1))!.archived_by).toBe("trainer");
    expect((await T1.rpc("can_access_client", { c: c1 })).data).toBe(false);
    expect((await T1.rpc("set_client_relationship_status", { p_rel: own.id, p_status: "active" })).error).toBeNull(); expect((await rel(t1, c1))!.status).toBe("active");
  });
  it("a former trainer cannot take the client back once another trainer has them", async () => {
    const own = (await rel(t1, c1))!;
    await T1.rpc("set_client_relationship_status", { p_rel: own.id, p_status: "archived" });
    await admin.from("trainer_client_relationships").insert({ trainer_id: t2, client_id: c1 });              // the client moved on (accepted an invitation from t2)
    const back = await T1.rpc("set_client_relationship_status", { p_rel: own.id, p_status: "active" });
    expect(back.error, "reactivation must be refused while another trainer is active").not.toBeNull();
    expect((await rel(t1, c1))!.status).toBe("archived"); expect((await T1.rpc("can_access_client", { c: c1 })).data).toBe(false);
    await admin.from("trainer_client_relationships").delete().eq("trainer_id", t2).eq("client_id", c1);
    await admin.from("trainer_client_relationships").update({ status: "active", archived_by: null }).eq("trainer_id", t1).eq("client_id", c1);
  });
  it("another trainer's relationship cannot be touched through the function", async () => {
    const theirs = (await rel(t2, c2))!;
    expect((await T1.rpc("set_client_relationship_status", { p_rel: theirs.id, p_status: "archived" })).error).not.toBeNull(); expect((await rel(t2, c2))!.status).toBe("active");
    expect((await C1.rpc("set_client_relationship_status", { p_rel: (await rel(t1, c1))!.id, p_status: "archived" })).error).not.toBeNull();
  });
  it("only signed-in users can call the functions", async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    expect((await anon.rpc("set_client_relationship_status", { p_rel: (await rel(t1, c1))!.id, p_status: "archived" })).error).not.toBeNull();
    expect((await anon.rpc("end_my_relationship", {})).error).not.toBeNull();
  });
});

describe("SEC-001: the client can end the relationship, and the trainer cannot undo it", () => {
  it("ending cuts access at once; the trainer cannot reactivate; trainers cannot call it", async () => {
    expect((await T1.rpc("end_my_relationship", {})).error, "only clients end their own relationship").not.toBeNull();
    expect((await C1.rpc("end_my_relationship", {})).error).toBeNull();
    const r = (await rel(t1, c1))!; expect(r.status).toBe("archived"); expect(r.archived_by).toBe("client");
    expect((await T1.rpc("can_access_client", { c: c1 })).data).toBe(false);
    expect((await T1.rpc("set_client_relationship_status", { p_rel: r.id, p_status: "active" })).error, "a trainer cannot undo the client's decision").not.toBeNull();
    expect((await rel(t1, c1))!.status).toBe("archived");
    expect((await C1.rpc("end_my_relationship", {})).error ?? null).toBeDefined();         // idempotent or harmless a second time
  });
});

describe("SEC-002: a user cannot change their own role", () => {
  it("a client cannot become a trainer, a trainer cannot become a client, and the id cannot be changed", async () => {
    await C2.from("profiles").update({ role: "trainer" }).eq("id", c2);
    expect((await admin.from("profiles").select("role").eq("id", c2).single()).data!.role).toBe("client");
    await T2.from("profiles").update({ role: "client" }).eq("id", t2);
    expect((await admin.from("profiles").select("role").eq("id", t2).single()).data!.role).toBe("trainer");
    await C2.from("profiles").update({ id: c1 }).eq("id", c2);
    expect((await admin.from("profiles").select("id").eq("id", c2).single()).data!.id).toBe(c2);
  });
  it("a role change in the same update as an allowed field changes nothing", async () => {
    await C2.from("profiles").update({ role: "trainer", full_name: "Nombre Nuevo" }).eq("id", c2);
    const p = (await admin.from("profiles").select("role,full_name").eq("id", c2).single()).data!; expect(p.role).toBe("client");
  });
  it("the display name stays editable, and the AI quota still follows the real role", async () => {
    expect((await C2.from("profiles").update({ full_name: "Nombre Editado" }).eq("id", c2)).error).toBeNull();
    expect((await admin.from("profiles").select("full_name").eq("id", c2).single()).data!.full_name).toBe("Nombre Editado");
    const { data } = await admin.from("ai_limits").select("role,per_day"); const per = Object.fromEntries((data ?? []).map((r) => [r.role, r.per_day])); expect(per.client).toBeLessThan(per.trainer);
  });
  it("the service role can still correct a role (support)", async () => {
    expect((await admin.from("profiles").update({ role: "client" }).eq("id", c2)).error).toBeNull();
  });
});
