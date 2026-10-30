// Requires local Supabase. Defense in depth (migration 0038): the signed-out role holds no table privileges, so RLS is not the only barrier.
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anon = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });

describe("signed-out role has no table privileges", () => {
  const tables = ["profiles", "consents", "progress_photos", "messages", "support_threads", "marketing_campaigns", "subscription_payments", "exercises", "foods", "invitations"];
  it.each(tables)("reads of %s are refused by privilege, not merely filtered to nothing", async (t) => {
    const r = await anon.from(t).select("*").limit(1);
    expect(r.error?.code).toBe("42501");
  });
  it.each(["profiles", "consents", "messages", "invitations"])("writes to %s are refused by privilege", async (t) => {
    const r = await anon.from(t).insert({}).select();
    expect(r.error?.code).toBe("42501");
  });
});

describe("AUD-002: helper functions are not an oracle about other people", () => {
  it("a signed-in stranger learns nothing about another user's consent, subscription or capacity; the user and their counterpart still do", async () => {
    const { createClient: mkClient } = await import("@supabase/supabase-js");
    const adm = mkClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const run = Date.now(); const ids: string[] = [];
    const mk = async (e: string, client = false) => { const { data } = await adm.auth.admin.createUser({ email: e, password: "Test-Pass-12345", email_confirm: true, app_metadata: client ? { role: "client" } : {} }); ids.push(data.user!.id); return data.user!.id; };
    const login = async (e: string) => { const c = mkClient(URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email: e, password: "Test-Pass-12345" }); return c; };
    try {
      const tr = await mk(`or-t-${run}@x.co`), cl = await mk(`or-c-${run}@x.co`, true); await mk(`or-s-${run}@x.co`);
      await adm.from("trainer_client_relationships").insert({ trainer_id: tr, client_id: cl });
      await adm.from("consents").insert({ user_id: cl, type: "health_data" });
      const S = await login(`or-s-${run}@x.co`), T = await login(`or-t-${run}@x.co`), C = await login(`or-c-${run}@x.co`);
      expect((await S.rpc("has_consent", { u: cl, t: "health_data" })).data).toBe(false);
      expect((await S.rpc("trainer_has_access", { t: tr })).data).toBe(false);
      expect((await S.rpc("trainer_capacity", { t: tr })).data).toBe(0);
      expect((await T.rpc("has_consent", { u: cl, t: "health_data" })).data).toBe(true);     // the trainer of that student
      expect((await C.rpc("trainer_has_access", { t: tr })).data).toBe(true);                 // the student of that trainer (trial is live)
      expect((await T.rpc("trainer_capacity", { t: tr })).data).toBe(20);                     // the trainer about themself
    } finally { for (const id of ids) await adm.auth.admin.deleteUser(id); }
  });
});

describe("AUD-001b: a signed-in user holds write privileges only where a policy allows that write", () => {
  it("direct writes to ledgers and audit trails are refused by privilege (42501), not just filtered by RLS", async () => {
    const { createClient: mkClient } = await import("@supabase/supabase-js");
    const adm = mkClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const e = `lp-${Date.now()}@x.co`; const { data } = await adm.auth.admin.createUser({ email: e, password: "Test-Pass-12345", email_confirm: true });
    try {
      const U = mkClient(URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
      await U.auth.signInWithPassword({ email: e, password: "Test-Pass-12345" });
      const cases: [string, Record<string, unknown>, string, unknown][] = [
        ["access_audit", { resource: "x" }, "id", 0], ["billing_audit_events", { kind: "x" }, "id", 0], ["ai_limits", { per_day: 99999 }, "role", "trainer"],
        ["provider_webhook_events", { provider: "bold" }, "event_id", "x"], ["subscription_payments", { status: "approved" }, "id", "00000000-0000-0000-0000-000000000000"],
        ["slot_purchases", { status: "approved" }, "id", "00000000-0000-0000-0000-000000000000"], ["auth_throttle", { hits: 0 }, "key", "x"],
        ["support_staff", { created_at: "2020-01-01" }, "user_id", "00000000-0000-0000-0000-000000000000"], ["marketing_campaigns", { title: "x" }, "id", "00000000-0000-0000-0000-000000000000"]];
      for (const [t, patch, col, val] of cases) {
        expect((await U.from(t).insert(patch).select()).error?.code, `insert ${t}`).toBe("42501");
        expect((await U.from(t).update(patch).eq(col, val as string)).error?.code, `update ${t}`).toBe("42501");
        expect((await U.from(t).delete().eq(col, val as string)).error?.code, `delete ${t}`).toBe("42501");
      }
    } finally { await adm.auth.admin.deleteUser(data.user!.id); }
  });
});
