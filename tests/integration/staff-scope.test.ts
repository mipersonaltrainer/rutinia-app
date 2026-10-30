// Requires local Supabase (synthetic data only). Least privilege for the support team: a staff session reads the support channel and
// trainers' names, and nothing about students, their health data, photos, messages, plans or anyone's payments — and writes nothing it should not.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }

let t: string, c: string, s: string, S: SupabaseClient, TRN: SupabaseClient; const T = () => TRN;
beforeAll(async () => {
  t = await mk(`sc-t-${run}@x.co`); c = await mk(`sc-c-${run}@x.co`, true); s = await mk(`sc-s-${run}@x.co`);
  const ok = (r: { error: { message: string } | null }, w: string) => { if (r.error) throw new Error(`${w}: ${r.error.message}`); };
  ok(await admin.rpc("make_support_staff", { p_user: s }), "staff");
  ok(await admin.from("trainer_client_relationships").insert({ trainer_id: t, client_id: c }), "rel");
  ok(await admin.from("consents").insert(["personal_data", "health_data", "share_with_trainer", "photos"].map((type) => ({ user_id: c, type }))), "consents");
  ok(await admin.from("messages").insert({ trainer_id: t, client_id: c, sender_id: c, body: "mensaje privado" }), "msg");
  ok(await admin.from("progress_photos").insert({ client_id: c, storage_path: `${c}/x.webp`, content_type: "image/webp", pose: "front", size_bytes: 10, taken_on: "2026-01-01" }), "photo");
  ok(await admin.from("training_plans").insert({ trainer_id: t, client_id: c, title: "Plan privado", level: "beginner" }), "plan");
  S = await login(`sc-s-${run}@x.co`); TRN = await login(`sc-t-${run}@x.co`);
});
afterAll(async () => { for (const id of created) await admin.auth.admin.deleteUser(id); });

describe("support staff: what a staff session can read", () => {
  it("is recognised as staff with the staff role and no trainer subscription", async () => {
    expect((await S.rpc("is_support_staff")).data).toBe(true);
    expect((await admin.from("profiles").select("role").eq("id", s).single()).data?.role).toBe("staff");
    expect((await admin.from("trainer_subscriptions").select("trainer_id").eq("trainer_id", s)).data).toEqual([]);
  });
  it.each(["trainer_client_relationships", "messages", "progress_photos", "consents", "training_plans", "assessments", "anthropometric_measurements", "nutrition_plans", "invitations",
    "subscription_payments", "slot_purchases", "ai_credit_purchases", "billing_audit_events", "access_audit", "push_subscriptions", "ai_interactions", "marketing_campaigns", "photo_reviews"])(
    "reads of %s return no rows (or are refused)", async (table) => {
      const r = await S.from(table).select("*").limit(5);
      expect(r.data ?? []).toEqual([]);
    });
  it("cannot read student profiles, only trainers'", async () => {
    expect((await S.from("profiles").select("id").eq("id", c)).data).toEqual([]);
    expect((await S.from("profiles").select("id").eq("id", t)).data).toEqual([{ id: t }]);
  });
  it("cannot sign private photo URLs of a student", async () => {
    const r = await S.storage.from("progress-photos").createSignedUrl(`${c}/x.webp`, 60);
    expect(r.data?.signedUrl ?? null).toBeNull();
  });
});

describe("support staff: what a staff session cannot change", () => {
  it("cannot edit a trainer's profile, role, subscription or the team list", async () => {
    await S.from("profiles").update({ full_name: "hackeado" }).eq("id", t);
    await S.from("profiles").update({ role: "staff" }).eq("id", s);
    await S.from("trainer_subscriptions").update({ status: "active" }).eq("trainer_id", t);
    await S.from("support_staff").insert({ user_id: t });
    expect((await admin.from("profiles").select("full_name,role").eq("id", t).single()).data?.role).toBe("trainer");
    expect((await admin.from("profiles").select("full_name").eq("id", t).single()).data?.full_name).not.toBe("hackeado");
    expect((await admin.from("support_staff").select("user_id").eq("user_id", t)).data).toEqual([]);
    expect((await admin.from("profiles").select("role").eq("id", s).single()).data?.role).toBe("staff");
  });
  it("cannot call the privileged team-management functions", async () => {
    expect((await S.rpc("make_support_staff", { p_user: t })).error).not.toBeNull();
    expect((await S.rpc("remove_support_staff", { p_user: s })).error).not.toBeNull();
    expect((await admin.from("support_staff").select("user_id").eq("user_id", s)).data).toHaveLength(1);
  });
});

describe("support staff: every look at a user's data leaves a trace the staff member cannot edit", () => {
  it("staff_log_access records the caller, the action and the target; others cannot call it; the log is unreadable and unwritable through the API", async () => {
    const ok = await S.rpc("staff_log_access", { p_action: "view_trainer", p_target: t });
    expect(ok.error).toBeNull();
    const rows = (await admin.from("staff_access_log").select("actor_id,action,target_user").eq("actor_id", s)).data;
    expect(rows).toEqual([{ actor_id: s, action: "view_trainer", target_user: t }]);
    expect((await S.rpc("staff_log_access", { p_action: "borrar_todo", p_target: t })).error).not.toBeNull();   // only known actions
    const T = await login(`sc-t-${run}@x.co`);
    expect((await T.rpc("staff_log_access", { p_action: "view_trainer", p_target: t })).error).not.toBeNull();   // a trainer is not staff
    expect((await S.from("staff_access_log").select("*")).error?.code).toBe("42501");
    expect((await S.from("staff_access_log").delete().eq("actor_id", s)).error?.code).toBe("42501");
    expect((await admin.from("staff_access_log").select("id").eq("actor_id", s)).data).toHaveLength(1);
  });
});

describe("the access log is a readable trail, not a stream of page refreshes", () => {
  it("opening the same record many times in a row leaves one line; another record or another action leaves its own", async () => {
    const ref = `dedupe-${run}`;
    for (let i = 0; i < 20; i++) expect((await S.rpc("staff_log_access", { p_action: "view_thread", p_target: t, p_ref: ref })).error).toBeNull();
    const count = async (action: string, r: string) => (await admin.from("staff_access_log").select("id").eq("actor_id", s).eq("action", action).eq("ref", r)).data!.length;
    expect(await count("view_thread", ref)).toBe(1);
    await S.rpc("staff_log_access", { p_action: "view_thread", p_target: t, p_ref: `${ref}-otro` });
    expect(await count("view_thread", `${ref}-otro`)).toBe(1);                    // a different record is a different access
    for (let i = 0; i < 3; i++) await S.rpc("staff_log_access", { p_action: "reply_thread", p_target: t, p_ref: ref });
    expect(await count("reply_thread", ref)).toBe(3);                              // replies, closes and campaigns are deliberate acts: every one counts
    await admin.from("staff_access_log").update({ at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq("actor_id", s).eq("action", "view_thread").eq("ref", ref);
    await S.rpc("staff_log_access", { p_action: "view_thread", p_target: t, p_ref: ref });
    expect(await count("view_thread", ref)).toBe(2);                               // after 10 minutes, looking again is a new access
  });
});

// RFC 6238 (TOTP, SHA-1, 6 digits, 30 s) — enough to act as the authenticator app in a test.
import { createHmac } from "node:crypto";
function totp(secretBase32: string, at = Date.now()) {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const ch of secretBase32.replace(/=+$/, "").toUpperCase()) bits += alpha.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac("sha1", key).update(ctr).digest(); const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}

describe("second factor for the support team (enforced in the database)", () => {
  const setRequired = (v: boolean) => admin.from("security_settings").update({ staff_mfa_required: v }).eq("id", true);
  afterAll(async () => { await setRequired(false); });

  it("while the switch is off nothing changes; while on, a password-only session is not staff but is still recognised as a member", async () => {
    expect((await S.rpc("is_support_staff")).data).toBe(true);
    await setRequired(true);
    expect((await S.rpc("is_support_staff")).data).toBe(false);
    expect((await S.rpc("is_support_staff_member")).data).toBe(true);
    expect((await T().rpc("is_support_staff_member")).data).toBe(false);                    // a trainer is not a member
    const th = (await T().rpc("support_open_thread", { p_category: "otro", p_subject: "Consulta mfa", p_body: "hola" })).data as string;
    expect((await S.rpc("support_send", { p_thread: th, p_body: "respuesta", p_as_staff: true })).error).not.toBeNull();     // staff powers are gone at aal1
    expect((await S.rpc("staff_log_access", { p_action: "view_thread", p_target: t })).error).not.toBeNull();
    expect((await S.from("support_threads").select("id").eq("id", th)).data).toEqual([]);                               // and so is the inbox
    await setRequired(false);
  });
  it("after enrolling an authenticator app and passing the challenge (aal2) the same person is staff again; the switch cannot be flipped through the API", async () => {
    const E = await login(`sc-s-${run}@x.co`);
    const enr = await E.auth.mfa.enroll({ factorType: "totp" }); expect(enr.error).toBeNull();
    const ch = await E.auth.mfa.challenge({ factorId: enr.data!.id }); expect(ch.error).toBeNull();
    const ver = await E.auth.mfa.verify({ factorId: enr.data!.id, challengeId: ch.data!.id, code: totp(enr.data!.totp.secret) }); expect(ver.error).toBeNull();
    await setRequired(true);
    expect((await E.rpc("is_support_staff")).data).toBe(true);
    const th = (await T().rpc("support_open_thread", { p_category: "otro", p_subject: "Consulta mfa dos", p_body: "hola" })).data as string;
    expect((await E.rpc("support_send", { p_thread: th, p_body: "respuesta con segundo factor", p_as_staff: true })).error).toBeNull();
    expect((await admin.from("notifications").select("title").eq("user_id", t).eq("kind", "support")).data?.[0]?.title).toBe("Soporte te respondi\u00f3");   // accents stored intact (0047)
    expect((await E.from("security_settings").update({ staff_mfa_required: false }).eq("id", true)).error?.code).toBe("42501");
    await setRequired(false);
  });
});

describe("the team can enrol a device for push; students still cannot", () => {
  it("staff and trainers save a push subscription; a student is refused", async () => {
    const args = (n: number) => ({ p_endpoint: `https://push.example.com/${run}-${n}`, p_p256dh: "p".repeat(30), p_auth: "a".repeat(12) });
    expect((await S.rpc("save_push_subscription", args(1))).error).toBeNull();
    expect((await TRN.rpc("save_push_subscription", args(2))).error).toBeNull();
    const C = await login(`sc-c-${run}@x.co`);
    expect((await C.rpc("save_push_subscription", args(3))).error).not.toBeNull();
    const rows = (await admin.from("push_subscriptions").select("user_id").like("endpoint", `%/${run}-%`)).data!.map((r) => r.user_id).sort();
    expect(rows).toEqual([s, t].sort());
    await admin.from("push_subscriptions").delete().like("endpoint", `%/${run}-%`);
  });
});
