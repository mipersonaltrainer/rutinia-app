// Requires local Supabase (with the Realtime container). Run: npm run test:int
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function listen(c: SupabaseClient, table: string, filter: string) {
  const got: Record<string, unknown>[] = [];
  const ch = c.channel(`t-${Math.random()}`).on("postgres_changes" as never, { event: "*", schema: "public", table, filter } as never, (p: { new: Record<string, unknown> }) => got.push(p.new));
  const ready = new Promise<void>((res, rej) => ch.subscribe((s) => { if (s === "SUBSCRIBED") res(); if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") rej(new Error(s)); }));
  return { got, ready, stop: () => c.removeChannel(ch) };
}

let t1: string, t2: string, c1: string, c2: string, T1: SupabaseClient, C1: SupabaseClient, C2: SupabaseClient;
beforeAll(async () => {
  t1 = await mk(`rt1-${run}@x.co`); t2 = await mk(`rt2-${run}@x.co`); c1 = await mk(`rc1-${run}@x.co`, true); c2 = await mk(`rc2-${run}@x.co`, true);
  await admin.from("trainer_client_relationships").insert([{ trainer_id: t1, client_id: c1 }, { trainer_id: t2, client_id: c2 }]);
  await admin.from("consents").insert([c1, c2].flatMap((u) => ["health_data", "share_with_trainer"].map((type) => ({ user_id: u, type }))));
  T1 = await login(`rt1-${run}@x.co`); C1 = await login(`rc1-${run}@x.co`); C2 = await login(`rc2-${run}@x.co`);
});
afterAll(async () => { for (const id of created) await admin.auth.admin.deleteUser(id); });

describe("realtime delivery respects RLS", { timeout: 30000 }, () => {
  it("the recipient receives a new message; a stranger subscribed with the same filter does not", async () => {
    const mine = listen(C1, "messages", `client_id=eq.${c1}`);
    const spy = listen(C2, "messages", `client_id=eq.${c1}`);        // tries to eavesdrop on c1's rows
    await Promise.all([mine.ready, spy.ready]); await sleep(1500);
    // SUBSCRIBED can precede the server's policy check being ready right after heavy DB activity: retry the send a couple of times.
    for (let attempt = 0; attempt < 3 && !mine.got.length; attempt++) {
      expect((await T1.rpc("send_message", { p_peer: c1, p_body: `en vivo ${attempt}` })).error).toBeNull();
      for (let i = 0; i < 25 && !mine.got.length; i++) await sleep(200);
    }
    await sleep(500);
    expect(mine.got.length).toBeGreaterThan(0); expect(mine.got.every((m) => String(m.body).startsWith("en vivo"))).toBe(true);
    expect(spy.got).toEqual([]);
    mine.stop(); spy.stop();
  });
  it("revoking consent stops delivery to the trainer", async () => {
    const trainer = listen(T1, "messages", `trainer_id=eq.${t1}`); await trainer.ready; await sleep(500);
    await C1.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", c1).eq("type", "share_with_trainer");
    await admin.from("messages").insert({ trainer_id: t1, client_id: c1, sender_id: c1, body: "tras revocar" });
    await sleep(2500); expect(trainer.got).toEqual([]);
    trainer.stop();
  });
});

describe("call reminders", () => {
  const mkCall = async (client: string, trainer: string, inH: number, createdAgoH: number, status = "scheduled") =>
    (await admin.from("video_calls").insert({ trainer_id: trainer, client_id: client, url: "https://meet.jit.si/x", scheduled_at: new Date(Date.now() + inH * 3600e3).toISOString(), created_at: new Date(Date.now() - createdAgoH * 3600e3).toISOString(), status }).select("id").single()).data!.id as string;
  const notes = async (user: string, id: string) => (await admin.from("notifications").select("dedupe_key,title").eq("user_id", user).like("dedupe_key", `%${id}`)).data!.map((n) => n.dedupe_key).sort();

  it("only the service role can run it", async () => {
    expect((await T1.rpc("send_call_reminders")).error).not.toBeNull(); expect((await C1.rpc("send_call_reminders")).error).not.toBeNull();
    expect((await admin.rpc("send_call_reminders")).error).toBeNull();
  });
  it("24h reminder for a call tomorrow booked long ago, to both parties, exactly once", async () => {
    await admin.from("consents").update({ revoked_at: null }).eq("user_id", c1);
    const id = await mkCall(c1, t1, 20, 48);
    await admin.rpc("send_call_reminders"); await admin.rpc("send_call_reminders");
    expect(await notes(c1, id)).toEqual([`callrem24h:${id}`]); expect(await notes(t1, id)).toEqual([`callrem24h:${id}`]);
  });
  it("1h reminder appears only inside the last hour, in addition to the 24h one, once", async () => {
    const id = await mkCall(c1, t1, 0.5, 48);
    await admin.rpc("send_call_reminders"); await admin.rpc("send_call_reminders");
    expect(await notes(c1, id)).toEqual([`callrem1h:${id}`, `callrem24h:${id}`]);
  });
  it("no reminder for far-future, canceled, past, just-booked, or lapsed-relationship calls", async () => {
    const far = await mkCall(c1, t1, 30, 48), canceled = await mkCall(c1, t1, 0.5, 48, "canceled"), past = await mkCall(c1, t1, -1, 48), fresh = await mkCall(c1, t1, 0.5, 0.1);
    await admin.rpc("send_call_reminders");
    expect(await notes(c1, far)).toEqual([]); expect(await notes(c1, canceled)).toEqual([]); expect(await notes(c1, past)).toEqual([]); expect(await notes(c1, fresh)).toEqual([]);
    const other = await mkCall(c2, t2, 0.5, 48); await admin.from("trainer_client_relationships").update({ status: "archived" }).eq("trainer_id", t2);
    await admin.rpc("send_call_reminders"); expect(await notes(c2, other)).toEqual([]);
  });
  it("a booked-today call (inside 24h at creation) skips the redundant 24h reminder but still gets the 1h one", async () => {
    const id = await mkCall(c1, t1, 0.4, 3);
    await admin.rpc("send_call_reminders"); expect(await notes(c1, id)).toEqual([`callrem1h:${id}`]);
  });
});
