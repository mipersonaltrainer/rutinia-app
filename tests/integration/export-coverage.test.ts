// Requires local Supabase (synthetic data). SEC-004: the exports carry the data the subject is entitled to, including what other tables hold about them.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildClientExport, buildTrainerExport } from "@/lib/privacy/export";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }

let t: string, c: string, T: SupabaseClient, C: SupabaseClient;
beforeAll(async () => {
  t = await mk(`ex-t-${run}@x.co`); c = await mk(`ex-c-${run}@x.co`, true);
  await admin.from("trainer_client_relationships").insert({ trainer_id: t, client_id: c });
  await admin.from("profiles").update({ birth_date: "1990-05-05", marketing_email: false }).eq("id", t);
  const { data: u } = await admin.from("ai_usage").insert({ user_id: t, kind: "plan_draft" }).select("id").single();
  await admin.from("ai_interactions").insert({ usage_id: u!.id, user_id: t, client_id: c, kind: "plan_draft", input_digest: "d", status: "ok", output: { nota: "borrador sobre el alumno" } });
  await admin.from("push_subscriptions").insert({ user_id: t, endpoint: "https://push.example.com/abc", p256dh: "p".repeat(30), auth: "a".repeat(12), user_agent: "TestBrowser" });
  T = await login(`ex-t-${run}@x.co`); C = await login(`ex-c-${run}@x.co`);
  await T.rpc("support_open_thread", { p_category: "pago", p_subject: "Consulta de exportación", p_body: "mensaje de soporte propio" });
});
afterAll(async () => { for (const id of created) await admin.auth.admin.deleteUser(id); });

describe("SEC-004 exports", () => {
  it("the student's export includes AI drafts written about them", async () => {
    const exp = await buildClientExport(C, c) as unknown as { ai_drafts_about_you: { kind: string; output: { nota: string } }[] };
    expect(exp.ai_drafts_about_you).toHaveLength(1);
    expect(exp.ai_drafts_about_you[0].output.nota).toBe("borrador sobre el alumno");
  });
  it("one student never receives another's AI drafts", async () => {
    const c2 = await mk(`ex-c2-${run}@x.co`, true); const C2 = await login(`ex-c2-${run}@x.co`);
    expect(((await buildClientExport(C2, c2)) as unknown as { ai_drafts_about_you: unknown[] }).ai_drafts_about_you).toEqual([]);
  });
  it("the trainer's export includes birth date, e-mail preference, devices (without keys), support conversations and AI usage", async () => {
    const exp = await buildTrainerExport(T, t) as unknown as Record<string, unknown> & { profile: Record<string, unknown>; push_devices: Record<string, unknown>[]; support_conversations: { support_messages: { body: string }[] }[]; ai_usage: unknown[] };
    expect(exp.profile.birth_date).toBe("1990-05-05"); expect(exp.profile.marketing_email).toBe(false);
    expect(exp.push_devices).toEqual([expect.objectContaining({ user_agent: "TestBrowser" })]);
    expect(JSON.stringify(exp.push_devices)).not.toMatch(/p256dh|auth|endpoint|push\.example/);
    expect(exp.support_conversations[0].support_messages[0].body).toBe("mensaje de soporte propio");
    expect(exp.ai_usage).toHaveLength(1);
  });
});
