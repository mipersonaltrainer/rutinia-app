// Requires local Supabase (synthetic data). AUD-003 / SEC-007: the AI audit trail can only be written by the server, for the reservation it made.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
const finishArgs = (usage: string, over: Record<string, unknown> = {}) => ({ p_usage: usage, p_status: "ok", p_provider: "anthropic", p_model: "claude-real", p_in: 10, p_out: 5, p_ms: 3, p_client: null, p_digest: "d", p_output: { texto: "salida del modelo" }, p_violations: [], p_flags: [], p_inter_status: "ok", ...over });

let t: string, T: SupabaseClient;
beforeAll(async () => { t = await mk(`ai-int-${run}@x.co`); T = await login(`ai-int-${run}@x.co`); });
afterAll(async () => { for (const id of created) await admin.auth.admin.deleteUser(id); });

describe("the AI audit trail cannot be forged by a user", () => {
  it("a signed-in user can reserve but cannot file an interaction record, and nothing is persisted", async () => {
    const r = (await T.rpc("ai_reserve", { p_kind: "plan_draft" })).data as { usage_id: string };
    expect(r.usage_id).toBeTruthy();
    const forged = await T.rpc("ai_finish", finishArgs(r.usage_id, { p_output: { texto: "FALSIFICADO" } }));
    expect(forged.error).not.toBeNull();
    expect((await admin.from("ai_interactions").select("id").eq("usage_id", r.usage_id)).data).toEqual([]);
    expect((await admin.from("ai_usage").select("status").eq("id", r.usage_id).single()).data?.status).toBe("reserved");
  });
  it("the server can finish it once, attributed to the reserving user; a second attempt fails", async () => {
    const r = (await T.rpc("ai_reserve", { p_kind: "plan_draft" })).data as { usage_id: string };
    const ok = await admin.rpc("ai_finish", finishArgs(r.usage_id)); expect(ok.error).toBeNull();
    const row = (await admin.from("ai_interactions").select("user_id,output,status").eq("usage_id", r.usage_id).single()).data;
    expect(row).toEqual({ user_id: t, output: { texto: "salida del modelo" }, status: "ok" });
    expect((await admin.rpc("ai_finish", finishArgs(r.usage_id))).error).not.toBeNull();
  });
  it("the record is tied to the reservation: a client that was not reserved for cannot be attached", async () => {
    const other = await mk(`ai-int-other-${run}@x.co`);
    const r = (await T.rpc("ai_reserve", { p_kind: "plan_draft" })).data as { usage_id: string };
    expect((await admin.rpc("ai_finish", finishArgs(r.usage_id, { p_client: other }))).error).not.toBeNull();
    expect((await admin.from("ai_interactions").select("id").eq("usage_id", r.usage_id)).data).toEqual([]);
  });
});
