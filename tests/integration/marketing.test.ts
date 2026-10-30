// Requires local Supabase. Run: npm run test:int
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sendBirthdayGreetings, sendCampaign, runDueCampaigns } from "@/lib/marketing/send";
import { colombiaToday } from "@/lib/marketing/birthday";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string, o: { client?: boolean; birth?: string; name?: string } = {}) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: o.name ?? "Persona Prueba", ...(o.birth ? { birth_date: o.birth } : {}) }, app_metadata: o.client ? { role: "client" } : {} });
  if (error) throw error; created.push(data.user.id); return data.user.id;
}
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }
const campaign = async (o: Record<string, unknown>) => (await admin.from("marketing_campaigns").insert({ kind: "campana", title: "Novedad", body: "Hola {nombre}, mira esto", channels: ["in_app"], audience: "uno", ...o }).select("id").single()).data!.id as string;
const notes = async (u: string) => (await admin.from("notifications").select("kind,title,body,link,dedupe_key").eq("user_id", u).eq("kind", "marketing")).data ?? [];

let a: string, b: string, c: string, A: SupabaseClient, B: SupabaseClient;
beforeAll(async () => {
  a = await mk(`ma-${run}@x.co`, { name: "Ana María Pérez" }); b = await mk(`mb-${run}@x.co`, { name: "Beto Gómez" }); c = await mk(`mc-${run}@x.co`); await mk(`mcl-${run}@x.co`, { client: true });
  A = await login(`ma-${run}@x.co`); B = await login(`mb-${run}@x.co`);
});
afterAll(async () => { for (const id of created) await admin.auth.admin.deleteUser(id); });

describe("marketing: access", () => {
  it("campaigns, settings and greetings are invisible and immutable through the API (service role only)", async () => {
    const id = await campaign({ audience_user: a });
    for (const t of ["marketing_campaigns", "marketing_settings", "birthday_greetings"]) { const r = await A.from(t).select("*"); expect(r.error?.message ?? (r.data ?? []).length, t).toBeTruthy(); }
    expect((await A.from("marketing_campaigns").insert({ kind: "campana", title: "x y z", body: "b", channels: ["in_app"], audience: "todos" })).error).not.toBeNull();
    expect((await A.from("marketing_settings").update({ birthday_auto: true }).eq("id", true)).error).not.toBeNull();
    await admin.from("marketing_campaigns").delete().eq("id", id);
  });
  it("the database rejects unsafe or malformed campaigns", async () => {
    for (const bad of [{ link: "javascript:alert(1)" }, { link: "//evil.example.com" }, { channels: [] }, { channels: ["sms"] }, { title: "ab" }, { audience: "uno", audience_user: null }, { kind: "spam" }]) {
      expect((await admin.from("marketing_campaigns").insert({ kind: "campana", title: "Novedad", body: "b", channels: ["in_app"], audience: "todos", ...bad })).error, JSON.stringify(bad)).not.toBeNull();
    }
    expect((await admin.from("marketing_campaigns").insert({ kind: "campana", title: "Novedad", body: "b", channels: ["in_app"], audience: "todos", link: "/trainer/billing" }).select("id").single()).error).toBeNull();
  });
  it("push subscriptions: saved only through the function, only for trainers, own rows only, a device that changes account moves", async () => {
    const ep = `https://push.example.com/${run}`, keys = { p_p256dh: "k".repeat(30), p_auth: "a".repeat(12) };
    expect((await A.rpc("save_push_subscription", { p_endpoint: ep, ...keys })).error).toBeNull();
    expect((await A.from("push_subscriptions").select("endpoint")).data).toEqual([{ endpoint: ep }]);
    expect((await B.from("push_subscriptions").select("endpoint")).data).toEqual([]);                                             // B cannot see A's
    expect((await A.from("push_subscriptions").insert({ user_id: a, endpoint: `${ep}x`, p256dh: "k".repeat(30), auth: "a".repeat(12) })).error).not.toBeNull();   // no direct insert
    expect((await A.rpc("save_push_subscription", { p_endpoint: "http://insecure.example.com/1", ...keys })).error).not.toBeNull();   // https only
    const CL = await login(`mcl-${run}@x.co`); expect((await CL.rpc("save_push_subscription", { p_endpoint: `${ep}c`, ...keys })).error?.message).toMatch(/forbidden/);
    expect((await B.rpc("save_push_subscription", { p_endpoint: ep, ...keys })).error).toBeNull();                                // same browser, other account
    expect((await admin.from("push_subscriptions").select("user_id").eq("endpoint", ep).single()).data!.user_id).toBe(b);
    expect((await A.from("push_subscriptions").select("endpoint")).data).toEqual([]);
    expect((await B.from("push_subscriptions").delete().eq("endpoint", ep)).error).toBeNull();
  });
});

describe("marketing: birth date at sign-up", () => {
  it("is stored when valid and silently dropped when not (signing up never fails because of it)", async () => {
    const good = await mk(`bd1-${run}@x.co`, { birth: "1990-05-10" }), future = await mk(`bd2-${run}@x.co`, { birth: "2999-01-01" }), young = await mk(`bd3-${run}@x.co`, { birth: new Date(Date.now() - 5 * 365 * 86400000).toISOString().slice(0, 10) });
    const junk = await mk(`bd4-${run}@x.co`, { birth: "no-es-fecha" }), old = await mk(`bd5-${run}@x.co`, { birth: "1800-01-01" }), cli = await mk(`bd6-${run}@x.co`, { client: true, birth: "1990-05-10" });
    const get = async (id: string) => (await admin.from("profiles").select("birth_date").eq("id", id).single()).data!.birth_date;
    expect(await get(good)).toBe("1990-05-10"); for (const id of [future, young, junk, old]) expect(await get(id)).toBeNull();
    expect(await get(cli)).toBeNull();                                                                                           // students never carry one
  });
  it("a trainer can edit their own birth date and preferences", async () => {
    expect((await A.from("profiles").update({ birth_date: "1991-02-03", marketing_email: false }).eq("id", a)).error).toBeNull();
    expect((await admin.from("profiles").select("birth_date,marketing_email,marketing_in_app").eq("id", a).single()).data).toEqual({ birth_date: "1991-02-03", marketing_email: false, marketing_in_app: true });
    await admin.from("profiles").update({ marketing_email: true, birth_date: null }).eq("id", a);
  });
});

describe("marketing: sending", () => {
  it("delivers to the bell with the first name, once, and records the result; a second send is refused", async () => {
    const id = await campaign({ audience_user: a, link: "/trainer/billing" });
    const r = await sendCampaign(admin, id); expect(r.ok).toBe(true); expect(r.stats).toMatchObject({ recipients: 1, in_app: 1 });
    expect(await notes(a)).toEqual([{ kind: "marketing", title: "Novedad", body: "Hola Ana, mira esto", link: "/trainer/billing", dedupe_key: `camp:${id}` }]);
    expect((await admin.from("marketing_campaigns").select("status,sent_at").eq("id", id).single()).data).toMatchObject({ status: "sent" });
    expect((await sendCampaign(admin, id)).reason).toBe("not_sendable"); expect(await notes(a)).toHaveLength(1);
    expect((await A.from("notifications").select("title").eq("kind", "marketing")).data!.length).toBeGreaterThan(0);                 // the trainer sees it in their own list
  });
  it("two overlapping sends of the same campaign deliver exactly once", async () => {
    const id = await campaign({ audience_user: b });
    const rs = await Promise.all([sendCampaign(admin, id), sendCampaign(admin, id), sendCampaign(admin, id)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1); expect(await notes(b)).toHaveLength(1);
  });
  it("opt-outs: a promotion respects them, a service notice still reaches the bell, a test to one person ignores them", async () => {
    await admin.from("profiles").update({ marketing_in_app: false }).eq("id", c);
    const promo = await campaign({ audience: "todos", kind: "campana", title: "Promo solo para quienes quieren" });
    // 'todos' reaches every trainer in the local database, so look only at what happened to the opted-out one
    await sendCampaign(admin, promo); expect((await notes(c)).filter((n) => n.title === "Promo solo para quienes quieren")).toEqual([]);
    const notice = await campaign({ audience: "todos", kind: "comunicado", title: "Mantenimiento programado" }); await sendCampaign(admin, notice);
    expect((await notes(c)).map((n) => n.title)).toContain("Mantenimiento programado");
    const test = await campaign({ audience: "uno", audience_user: c, kind: "campana", title: "Prueba del equipo" }); await sendCampaign(admin, test);
    expect((await notes(c)).map((n) => n.title)).toContain("Prueba del equipo");
    await admin.from("profiles").update({ marketing_in_app: true }).eq("id", c);
  });
  it("push: sends to subscribed devices, removes dead ones, and says so when it is not configured", async () => {
    const live = `https://push.example.com/live-${run}`, dead = `https://push.example.com/dead-${run}`;
    await admin.from("push_subscriptions").insert([{ user_id: a, endpoint: live, p256dh: "k".repeat(30), auth: "a".repeat(12) }, { user_id: a, endpoint: dead, p256dh: "k".repeat(30), auth: "a".repeat(12) }]);
    const push = { sendNotification: vi.fn(async (s: { endpoint: string }, ...rest: unknown[]) => { if (s.endpoint === dead) throw Object.assign(new Error("gone"), { statusCode: 410 }); void rest; return {}; }) };
    const env = { VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "prv", VAPID_SUBJECT: "mailto:a@b.co" };
    const id = await campaign({ audience_user: a, channels: ["in_app", "push"], title: "Push de prueba" });
    const r = await sendCampaign(admin, id, {}, { env, push: push as never });
    expect(r.stats).toMatchObject({ in_app: 1, push_sent: 1, push_failed: 1, push_removed: 1 });
    expect(JSON.parse(String(push.sendNotification.mock.calls[0][1]))).toMatchObject({ title: "Push de prueba", body: "Hola Ana, mira esto" });
    expect((await admin.from("push_subscriptions").select("endpoint").eq("user_id", a)).data).toEqual([{ endpoint: live }]);
    const off = await campaign({ audience_user: a, channels: ["push"], title: "Sin claves" });
    expect((await sendCampaign(admin, off, {}, { env: {}, push: push as never })).stats).toMatchObject({ push_skipped: "not_configured" });
    await admin.from("push_subscriptions").delete().eq("user_id", a);
  });
  it("e-mail: sent through the provider to people who accept it; skipped, not failed, when it is not configured", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    const env = { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test", EMAIL_FROM: "Rutinia <no-responder@rutinia.company>", APPLICATION_BASE_URL: "https://app.example.com" };
    const id = await campaign({ audience_user: a, channels: ["email"], title: "Correo de prueba", link: "/trainer/support" });
    const r = await sendCampaign(admin, id, {}, { env, fetchImpl: f as unknown as typeof fetch }); expect(r.stats).toMatchObject({ recipients: 1, email_sent: 1, email_failed: 0 });
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body); expect(body.to).toEqual([`ma-${run}@x.co`]); expect(body.subject).toBe("Correo de prueba"); expect(body.html).toContain("https://app.example.com/trainer/support");
    const off = await campaign({ audience_user: a, channels: ["email"], title: "Sin correo" });
    expect((await sendCampaign(admin, off, {}, { env: {} })).stats).toMatchObject({ email_skipped: "not_configured" });
    expect((await admin.from("marketing_campaigns").select("status").eq("id", off).single()).data!.status).toBe("sent");
  });
  it("scheduled campaigns go out when their time has come, and not before", async () => {
    const later = await campaign({ audience_user: b, status: "scheduled", scheduled_at: new Date(Date.now() + 3600_000).toISOString(), title: "Futura" });
    const due = await campaign({ audience_user: b, status: "scheduled", scheduled_at: new Date(Date.now() - 60_000).toISOString(), title: "Ya toca" });
    const out = await runDueCampaigns(admin); expect(out.find((o) => o.id === due)?.ok).toBe(true); expect(out.find((o) => o.id === later)).toBeUndefined();
    expect((await admin.from("marketing_campaigns").select("status").eq("id", later).single()).data!.status).toBe("scheduled");
    await admin.from("marketing_campaigns").update({ status: "canceled" }).eq("id", later);
  });
});

describe("marketing: birthday greetings", () => {
  it("greets today's birthdays once per year, only if they gave a date, and the automatic mode obeys the switch", async () => {
    const t = colombiaToday(new Date()), md = `${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`;
    const bday = await mk(`bday-${run}@x.co`, { name: "Cumple Añero", birth: `1990-${md}` });
    await admin.from("marketing_settings").update({ birthday_auto: false }).eq("id", true);
    expect(await sendBirthdayGreetings(admin, { auto: true })).toMatchObject({ greeted: 0, skipped: "auto_off" });                  // switch off: the cron does nothing
    const r = await sendBirthdayGreetings(admin, { auto: false }); expect(r.greeted).toBeGreaterThanOrEqual(1);
    const mine = (await notes(bday)).find((n) => n.dedupe_key === `bday:${t.y}`); expect(mine?.title).toBe("¡Feliz cumpleaños, Cumple! 🎂");
    expect((await admin.from("birthday_greetings").select("year").eq("user_id", bday)).data).toEqual([{ year: t.y }]);
    expect(await sendBirthdayGreetings(admin, { auto: false })).toMatchObject({ greeted: 0, skipped: "already_greeted" });          // never twice in a year
    expect((await notes(bday)).filter((n) => n.dedupe_key === `bday:${t.y}`)).toHaveLength(1);
    await admin.from("marketing_settings").update({ birthday_auto: true }).eq("id", true);
    expect(await sendBirthdayGreetings(admin, { auto: true })).toMatchObject({ greeted: 0 });                                       // already greeted: still nothing
    await admin.from("marketing_settings").update({ birthday_auto: false }).eq("id", true);
  });
});
