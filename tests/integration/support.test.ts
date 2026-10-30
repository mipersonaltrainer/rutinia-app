// Requires local Supabase. Run: npm run test:int
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
const open = (c: SupabaseClient, subject = "No se activó mi cupo", body = "Pagué ayer") => c.rpc("support_open_thread", { p_category: "pago", p_subject: subject, p_body: body });
const send = (c: SupabaseClient, thread: string, body: string, asStaff = false) => c.rpc("support_send", { p_thread: thread, p_body: body, p_as_staff: asStaff });
const thread = async (id: string) => (await admin.from("support_threads").select("status,trainer_unread,staff_unread").eq("id", id).single()).data!;

let t1: string, t2: string, staffId: string, cl: string, T1: SupabaseClient, T2: SupabaseClient, S: SupabaseClient, C: SupabaseClient;
beforeAll(async () => {
  t1 = await mk(`st1-${run}@x.co`); t2 = await mk(`st2-${run}@x.co`); staffId = await mk(`ss-${run}@x.co`); cl = await mk(`sc-${run}@x.co`, true);
  await admin.from("support_staff").insert({ user_id: staffId });
  T1 = await login(`st1-${run}@x.co`); T2 = await login(`st2-${run}@x.co`); S = await login(`ss-${run}@x.co`); C = await login(`sc-${run}@x.co`);
});
afterAll(async () => { for (const id of created) await admin.auth.admin.deleteUser(id); });

describe("support channel", () => {
  it("a trainer opens a conversation even when their workspace is blocked (an expired subscription is when support is needed)", async () => {
    await admin.from("trainer_subscriptions").update({ status: "payment_required" }).eq("trainer_id", t1);
    expect((await T1.rpc("trainer_has_access", { t: t1 })).data).toBe(false);
    const { data: id, error } = await open(T1); expect(error).toBeNull(); expect(id).toBeTruthy();
    expect(await thread(id as string)).toEqual({ status: "open", trainer_unread: 0, staff_unread: 1 });
    expect((await T1.from("support_messages").select("sender_kind,sender_id,body").eq("thread_id", id as string)).data).toEqual([{ sender_kind: "trainer", sender_id: t1, body: "Pagué ayer" }]);
  });

  it("only the trainer and the team can see a conversation; nobody else can read, write, mark or close it", async () => {
    const { data: id } = await open(T1, "Privado"); const th = id as string;
    expect((await T2.from("support_threads").select("id").eq("id", th)).data).toEqual([]);
    expect((await T2.from("support_messages").select("id").eq("thread_id", th)).data).toEqual([]);
    expect((await send(T2, th, "intruso")).error?.message).toMatch(/forbidden/);
    expect((await send(T2, th, "intruso", true)).error?.message).toMatch(/forbidden/);          // claiming to be the team without being on it
    expect((await T2.rpc("support_set_status", { p_thread: th, p_status: "closed", p_as_staff: false })).error?.message).toMatch(/forbidden/);
    expect((await T2.rpc("support_set_status", { p_thread: th, p_status: "closed", p_as_staff: true })).error?.message).toMatch(/forbidden/);
    expect((await T1.from("support_threads").select("id").eq("id", th)).data).toHaveLength(1);
    expect((await S.from("support_threads").select("id").eq("id", th)).data).toHaveLength(1);
    expect((await S.from("support_messages").select("id").eq("thread_id", th)).data).toHaveLength(1);
  });

  it("clients cannot open conversations, and nothing can be written without the functions", async () => {
    expect((await open(C)).error?.message).toMatch(/forbidden/);
    const { data: id } = await open(T1, "Directo"); const th = id as string;
    expect((await T1.from("support_messages").insert({ thread_id: th, sender_id: t1, sender_kind: "staff", body: "forged" })).error).not.toBeNull();
    expect((await T1.from("support_threads").insert({ trainer_id: t1, category: "pago", subject: "directo" })).error).not.toBeNull();
    expect((await T1.from("support_threads").update({ status: "closed" }).eq("id", th).select()).data ?? []).toEqual([]);   // no UPDATE privilege: refused, nothing returned
    expect((await T1.from("support_staff").select("user_id")).data ?? []).toEqual([]);                                // the team list is not readable through the API
    expect((await T1.from("support_staff").insert({ user_id: t1 })).error).not.toBeNull();                             // nor can anyone add themselves
  });

  it("counters, status and the notification follow the conversation; only the first unanswered message is 'first'", async () => {
    const { data: id } = await open(T2, "Contadores"); const th = id as string;
    expect(await thread(th)).toEqual({ status: "open", trainer_unread: 0, staff_unread: 1 });
    const a = await send(T2, th, "¿Alguien me ayuda?"); expect((a.data as { first_unanswered: boolean }).first_unanswered).toBe(false);   // the opening message already counts
    expect(await thread(th)).toMatchObject({ status: "open", staff_unread: 2 });
    expect((await S.rpc("support_mark_read", { p_thread: th, p_as_staff: true })).error).toBeNull();
    expect(await thread(th)).toMatchObject({ staff_unread: 0 });
    expect(((await send(T2, th, "Sigo aquí")).data as { first_unanswered: boolean }).first_unanswered).toBe(true);   // first one after the team caught up

    expect((await send(S, th, "Hola, lo revisamos", true)).error).toBeNull();
    expect(await thread(th)).toEqual({ status: "answered", trainer_unread: 1, staff_unread: 0 });
    const { data: n } = await T2.from("notifications").select("kind,link").eq("user_id", t2).eq("kind", "support");
    expect(n).toEqual([{ kind: "support", link: `/trainer/support/${th}` }]);
    expect((await T2.rpc("support_mark_read", { p_thread: th, p_as_staff: false })).error).toBeNull();
    expect((await thread(th)).trainer_unread).toBe(0);
    expect((await T2.from("support_messages").select("sender_kind").eq("thread_id", th).order("created_at")).data!.map((m) => m.sender_kind)).toEqual(["trainer", "trainer", "trainer", "staff"]);
  });

  it("closing and reopening: the trainer can close their own; writing again reopens; the team can reopen", async () => {
    const { data: id } = await open(T2, "Cierre"); const th = id as string;
    expect((await T2.rpc("support_set_status", { p_thread: th, p_status: "closed", p_as_staff: false })).error).toBeNull();
    expect((await thread(th)).status).toBe("closed");
    expect((await send(T2, th, "Una duda más")).error).toBeNull(); expect((await thread(th)).status).toBe("open");
    expect((await S.rpc("support_set_status", { p_thread: th, p_status: "closed", p_as_staff: true })).error).toBeNull();
    expect((await S.rpc("support_set_status", { p_thread: th, p_status: "open", p_as_staff: true })).error).toBeNull();
    expect((await T2.rpc("support_set_status", { p_thread: th, p_status: "bogus", p_as_staff: false })).error?.message).toMatch(/invalid status/);
  });

  it("validates input and limits abuse: lengths, topic, 5 open at once, message rate", async () => {
    expect((await T1.rpc("support_open_thread", { p_category: "hack", p_subject: "valido", p_body: "x" })).error?.message).toMatch(/invalid category/);
    expect((await open(T1, "ab")).error?.message).toMatch(/invalid subject/);
    expect((await open(T1, "valido", "   ")).error?.message).toMatch(/invalid message length/);
    expect((await open(T1, "valido", "x".repeat(4001))).error?.message).toMatch(/invalid message length/);
    // t1 already has several open conversations from the tests above; close them all, then hit the cap of 5
    await admin.from("support_threads").update({ status: "closed" }).eq("trainer_id", t1);
    await admin.from("support_messages").delete().eq("sender_id", t1);
    for (let i = 0; i < 5; i++) expect((await open(T1, `Abierta ${i}`)).error).toBeNull();
    expect((await open(T1, "Una más")).error?.message).toMatch(/too many open|rate limited/);
    await admin.from("support_threads").update({ status: "closed" }).eq("trainer_id", t1);
    await admin.from("support_messages").delete().eq("sender_id", t1);
    const { data: id } = await open(T1, "Ritmo"); let limited = false;
    for (let i = 0; i < 25 && !limited; i++) limited = /rate limited/.test((await send(T1, id as string, `m${i}`)).error?.message ?? "");
    expect(limited).toBe(true);
  });

  it("the functions are not callable without signing in", async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    for (const [fn, args] of [["support_open_thread", { p_category: "pago", p_subject: "anon", p_body: "x" }], ["support_send", { p_thread: "00000000-0000-0000-0000-000000000000", p_body: "x", p_as_staff: false }], ["is_support_staff", {}]] as const) {
      expect((await anon.rpc(fn, args)).error, fn).not.toBeNull();
    }
  });

  it("the team sees trainer names (and only trainers')", async () => {
    expect((await S.from("profiles").select("id").eq("id", t2)).data).toHaveLength(1);
    expect((await S.from("profiles").select("id").eq("id", cl)).data).toEqual([]);          // a client's profile stays private
    expect((await T2.from("profiles").select("id").eq("id", t1)).data).toEqual([]);          // a trainer still cannot read another trainer
  });
});

describe("support accounts (role staff)", () => {
  it("converting a fresh trainer removes the trial and the trainer role; the team list gets the account", async () => {
    const id = await mk(`sx-${run}@x.co`);
    expect((await admin.from("trainer_subscriptions").select("trainer_id").eq("trainer_id", id)).data).toHaveLength(1);        // every new trainer starts a trial
    const r = await admin.rpc("make_support_staff", { p_user: id }); expect(r.error).toBeNull(); expect((r.data as { was: string }).was).toBe("trainer");
    expect((await admin.from("profiles").select("role").eq("id", id).single()).data).toEqual({ role: "staff" });
    expect((await admin.from("trainer_subscriptions").select("trainer_id").eq("trainer_id", id)).data).toEqual([]);
    expect((await admin.from("support_staff").select("user_id").eq("user_id", id)).data).toHaveLength(1);
    expect((await admin.rpc("make_support_staff", { p_user: id })).error).toBeNull();                                          // idempotent
    const X = await login(`sx-${run}@x.co`);
    expect((await X.rpc("is_support_staff")).data).toBe(true);
    expect((await open(X)).error?.message).toMatch(/forbidden/);                                                                // a support account is not a trainer: it cannot open conversations
    expect((await X.rpc("trainer_has_access", { t: id })).data).toBe(false);
    await admin.rpc("remove_support_staff", { p_user: id });
    expect((await X.rpc("is_support_staff")).data).toBe(false);
  });
  it("refuses to convert a trainer who already has students, and a client; only the service role can call it", async () => {
    expect((await admin.rpc("make_support_staff", { p_user: t1 })).error).toBeNull();                                           // t1 has no students: allowed...
    await admin.from("profiles").update({ role: "trainer" }).eq("id", t1); await admin.from("trainer_subscriptions").insert({ trainer_id: t1 }).select();
    await admin.from("support_staff").delete().eq("user_id", t1);
    const busy = await mk(`sb-${run}@x.co`); const c2 = await mk(`sbc-${run}@x.co`, true);
    await admin.from("trainer_client_relationships").insert({ trainer_id: busy, client_id: c2 });
    expect((await admin.rpc("make_support_staff", { p_user: busy })).error?.message).toMatch(/trainer data/);
    expect((await admin.rpc("make_support_staff", { p_user: c2 })).error?.message).toMatch(/is a client/);
    expect((await T2.rpc("make_support_staff", { p_user: t2 })).error).not.toBeNull();                                          // authenticated users cannot promote themselves
  });
});
