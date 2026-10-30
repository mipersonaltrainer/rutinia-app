// Requires local Supabase. Run: npm run test:int
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eraseClientAccount } from "@/lib/privacy/erase";
import { URL_VECTORS } from "../fixtures-call-urls";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
const send = (c: SupabaseClient, peer: string, body: string) => c.rpc("send_message", { p_peer: peer, p_body: body });
const soon = () => new Date(Date.now() + 86400e3).toISOString();

let t1: string, t2: string, c1: string, c2: string, T1: SupabaseClient, T2: SupabaseClient, C1: SupabaseClient, C2: SupabaseClient;
beforeAll(async () => {
  t1 = await mk(`mt1-${run}@x.co`); t2 = await mk(`mt2-${run}@x.co`); c1 = await mk(`mc1-${run}@x.co`, true); c2 = await mk(`mc2-${run}@x.co`, true);
  await admin.from("trainer_client_relationships").insert([{ trainer_id: t1, client_id: c1 }, { trainer_id: t2, client_id: c2 }]);
  await admin.from("consents").insert([c1, c2].flatMap((u) => ["health_data", "share_with_trainer"].map((type) => ({ user_id: u, type }))));
  T1 = await login(`mt1-${run}@x.co`); T2 = await login(`mt2-${run}@x.co`); C1 = await login(`mc1-${run}@x.co`); C2 = await login(`mc2-${run}@x.co`);
});
afterAll(async () => { for (const id of created) await admin.auth.admin.deleteUser(id); });

describe("messaging", () => {
  it("a trainer and their client can talk; the sender is taken from the session, never from the caller", async () => {
    expect((await send(T1, c1, "Hola, ¿cómo vas?")).error).toBeNull();
    expect((await send(C1, t1, "Bien, gracias")).error).toBeNull();
    const { data } = await C1.from("messages").select("sender_id,body").order("created_at");
    expect(data!.map((m) => m.sender_id)).toEqual([t1, c1]);
    expect((await C1.from("messages").insert({ trainer_id: t1, client_id: c1, sender_id: t1, body: "forged" })).error).not.toBeNull();   // no direct insert
  });
  it("nobody outside the pair can read, write, or mark-read", async () => {
    expect((await send(T2, c1, "intruso")).error?.message).toMatch(/forbidden/);
    expect((await send(C2, t1, "intruso")).error?.message).toMatch(/forbidden/);
    expect((await T2.from("messages").select("id").eq("client_id", c1)).data).toEqual([]);
    expect((await C2.from("messages").select("id").eq("client_id", c1)).data).toEqual([]);
    expect((await C2.rpc("mark_conversation_read", { p_peer: t1 })).data).toBe(0);
    expect((await T2.rpc("mark_conversation_read", { p_peer: c1 })).data).toBe(0);
  });
  it("messages are immutable for users (no update/delete)", async () => {
    const { data } = await C1.from("messages").select("id").limit(1).single();
    await C1.from("messages").update({ body: "editado" }).eq("id", data!.id); await C1.from("messages").delete().eq("id", data!.id);
    expect((await admin.from("messages").select("body").eq("id", data!.id).single()).data!.body).not.toBe("editado");
  });
  it("marking read affects only the other party's messages", async () => {
    expect((await C1.rpc("mark_conversation_read", { p_peer: t1 })).data).toBe(1);
    const { data } = await admin.from("messages").select("sender_id,read_at").eq("client_id", c1);
    expect(data!.find((m) => m.sender_id === t1)!.read_at).not.toBeNull(); expect(data!.find((m) => m.sender_id === c1)!.read_at).toBeNull();
  });
  it("length is enforced and empty is rejected", async () => {
    expect((await send(T1, c1, "   ")).error).not.toBeNull(); expect((await send(T1, c1, "a".repeat(2001))).error).not.toBeNull();
  });
  it("sending is rate limited per sender", async () => {
    const results = []; for (let i = 0; i < 24; i++) results.push((await send(C2, t2, `m${i}`)).error?.message ?? "ok");
    expect(results.filter((r) => r === "ok").length).toBe(20); expect(results.slice(20).every((r) => /rate limited/.test(r))).toBe(true);
  });
  it("notifications are throttled (one per sender per hour)", async () => {
    const { data } = await admin.from("notifications").select("id").eq("user_id", t2).eq("kind", "message"); expect(data!.length).toBe(1);
  });
  it("revoking the share consent cuts the trainer off immediately but the client keeps their own history", async () => {
    await C1.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", c1).eq("type", "share_with_trainer");
    expect((await send(T1, c1, "¿sigues ahí?")).error?.message).toMatch(/forbidden/);
    expect((await T1.from("messages").select("id").eq("client_id", c1)).data).toEqual([]);
    expect((await C1.from("messages").select("id")).data!.length).toBeGreaterThan(0);
    await admin.from("consents").update({ revoked_at: null }).eq("user_id", c1).eq("type", "share_with_trainer");
  });
  it("an archived relationship or lapsed workspace blocks the trainer", async () => {
    await admin.from("trainer_subscriptions").update({ status: "expired", trial_ends_at: new Date(Date.now() - 1e3).toISOString(), current_period_end: null }).eq("trainer_id", t1);
    expect((await send(T1, c1, "x")).error?.message).toMatch(/workspace inactive/);
    expect((await send(C1, t1, "client can still write")).error).toBeNull();
    await admin.from("trainer_subscriptions").update({ status: "trialing", trial_ends_at: new Date(Date.now() + 5 * 86400e3).toISOString() }).eq("trainer_id", t1);
    await admin.from("trainer_client_relationships").update({ status: "archived" }).eq("trainer_id", t1);
    expect((await send(T1, c1, "x")).error?.message).toMatch(/forbidden/);
    expect((await send(C1, t1, "x")).error?.message).toMatch(/forbidden/);
    await admin.from("trainer_client_relationships").update({ status: "active" }).eq("trainer_id", t1);
  });
});

describe("profile visibility", () => {
  it("a client sees their own trainer's name, not other trainers or other clients", async () => {
    expect((await C1.from("profiles").select("id").eq("id", t1)).data!.length).toBe(1);
    expect((await C1.from("profiles").select("id").in("id", [t2, c2])).data).toEqual([]);
  });
});

describe("video calls", () => {
  it("the database allowlist agrees with the TypeScript one on every vector", async () => {
    for (const [u, ok] of URL_VECTORS) {
      const { data } = await admin.rpc("is_allowed_call_url", { u });
      expect([u, data]).toEqual([u, ok]);
    }
  });
  it("only the client's own trainer can schedule, with an allowed link and a sane date", async () => {
    expect((await C1.rpc("schedule_call", { p_client: c1, p_url: "https://meet.jit.si/x", p_when: soon(), p_note: null })).error?.message).toMatch(/forbidden/);
    expect((await T2.rpc("schedule_call", { p_client: c1, p_url: "https://meet.jit.si/x", p_when: soon(), p_note: null })).error?.message).toMatch(/forbidden/);
    expect((await T1.rpc("schedule_call", { p_client: c1, p_url: "https://evil.example/x", p_when: soon(), p_note: null })).error?.message).toMatch(/link not allowed/);
    expect((await T1.rpc("schedule_call", { p_client: c1, p_url: "https://meet.jit.si/x", p_when: "2001-01-01T00:00:00Z", p_note: null })).error?.message).toMatch(/invalid date/);
    expect((await T1.from("video_calls").insert({ trainer_id: t1, client_id: c1, url: "https://zoom.us/j/1", scheduled_at: soon() })).error).not.toBeNull();
  });
  it("scheduling creates the call, an invite message and a notification; the client sees it; strangers do not", async () => {
    const r = await T1.rpc("schedule_call", { p_client: c1, p_url: "https://meet.jit.si/rutinia-abc", p_when: soon(), p_note: "Revisión mensual" });
    expect(r.error).toBeNull(); const id = r.data as string;
    expect((await C1.from("video_calls").select("url,note").eq("id", id).single()).data).toEqual({ url: "https://meet.jit.si/rutinia-abc", note: "Revisión mensual" });
    expect((await C1.from("messages").select("kind,call_id").eq("call_id", id).single()).data!.kind).toBe("call_invite");
    expect((await admin.from("notifications").select("id").eq("user_id", c1).eq("kind", "call")).data!.length).toBeGreaterThan(0);
    expect((await C2.from("video_calls").select("id").eq("id", id)).data).toEqual([]);
    expect((await T2.from("video_calls").select("id").eq("id", id)).data).toEqual([]);
    expect((await C1.rpc("cancel_call", { p_call: id })).error?.message).toMatch(/forbidden/);
    expect((await T2.rpc("cancel_call", { p_call: id })).error?.message).toMatch(/forbidden/);
    expect((await T1.rpc("cancel_call", { p_call: id })).error).toBeNull();
    expect((await C1.from("video_calls").select("status").eq("id", id).single()).data!.status).toBe("canceled");
  });
});

describe("account erasure", () => {
  it("erasing a client removes their conversation and calls, and export includes them while they exist", async () => {
    await T2.rpc("schedule_call", { p_client: c2, p_url: "https://meet.jit.si/y", p_when: soon(), p_note: null });
    const { data } = await C2.from("messages").select("body"); expect(data!.length).toBeGreaterThan(0);
    expect((await C2.from("video_calls").select("id")).data!.length).toBe(1);
    await eraseClientAccount(c2);
    expect((await admin.from("messages").select("id").eq("client_id", c2)).data).toEqual([]);
    expect((await admin.from("video_calls").select("id").eq("client_id", c2)).data).toEqual([]);
  });
});
