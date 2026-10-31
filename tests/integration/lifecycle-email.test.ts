// Requires local Supabase (synthetic data only). The cron's subscription e-mails: who is picked, that each goes out once per period,
// that a failed send is retried, and that someone outside the window (or already expired) is left alone.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { runLifecycleEmails } from "@/lib/billing/lifecycle-email";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const created: string[] = [];
const ENV = { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test", EMAIL_FROM: "Rutinia <no-responder@rutinia.co>", APPLICATION_BASE_URL: "https://www.rutinia.co" };
const DAY = 86_400_000;
const mk = async (tag: string, name: string) => { const email = `lc-${tag}-${run}@x.co`; const { data, error } = await admin.auth.admin.createUser({ email, password: "Test-Pass-12345", email_confirm: true, user_metadata: { full_name: name } }); if (error) throw error; created.push(data.user.id); await admin.from("profiles").update({ full_name: name }).eq("id", data.user.id); return { id: data.user.id, email }; };
const setSub = (id: string, patch: Record<string, unknown>) => admin.from("trainer_subscriptions").update(patch).eq("trainer_id", id);
const ok = () => vi.fn(async () => ({ ok: true }));
const mine = (calls: unknown[][], emails: string[]) => calls.map((c) => c[1] as { to: string; subject: string; text: string }).filter((m) => emails.includes(m.to));

afterAll(async () => { for (const id of created) await admin.auth.admin.deleteUser(id); });

describe("trial and renewal e-mails", () => {
  let t1: { id: string; email: string }, t2: { id: string; email: string }, t3: { id: string; email: string }, t4: { id: string; email: string }, t5: { id: string; email: string };
  beforeAll(async () => {
    t1 = await mk("trial", "Camila Rojas"); t2 = await mk("far", "Lejos Aún"); t3 = await mk("paid", "Pago Bold"); t4 = await mk("pp", "Pago Paypal"); t5 = await mk("exp", "Ya Vencida");
    const now = Date.now();
    await setSub(t1.id, { status: "trialing", trial_ends_at: new Date(now + 1.5 * DAY).toISOString() });                                // within 2 days
    await setSub(t2.id, { status: "trialing", trial_ends_at: new Date(now + 5 * DAY).toISOString() });                                  // too early
    await setSub(t3.id, { status: "active", provider: "wompi", current_period_end: new Date(now + 4 * DAY).toISOString() });            // within 5 days
    await setSub(t4.id, { status: "active", provider: "paypal", current_period_end: new Date(now + 4.5 * DAY).toISOString() });
    await setSub(t5.id, { status: "trialing", trial_ends_at: new Date(now - DAY).toISOString() });                                      // already over
  });

  it("sends the right notice to the right people, only inside the window", async () => {
    const send = ok();
    const r = await runLifecycleEmails(admin, ENV, { sendEmailImpl: send as never });
    const sent = mine(send.mock.calls as unknown[][], [t1.email, t2.email, t3.email, t4.email, t5.email]);
    expect(sent.map((m) => m.to).sort()).toEqual([t1.email, t3.email, t4.email].sort());
    expect(sent.find((m) => m.to === t1.email)!.subject).toBe("Tu prueba gratuita de Rutinia termina en 2 días");
    expect(sent.find((m) => m.to === t1.email)!.text).toContain("Hola Camila,");
    expect(sent.find((m) => m.to === t3.email)!.text).toContain("No hay cobro automático");
    expect(sent.find((m) => m.to === t4.email)!.text).toContain("se renovará automáticamente");
    expect(r.trial).toBeGreaterThanOrEqual(1); expect(r.renewal).toBeGreaterThanOrEqual(2);
  });
  it("never repeats a notice for the same period, even if the cron runs again", async () => {
    const send = ok();
    await runLifecycleEmails(admin, ENV, { sendEmailImpl: send as never });
    expect(mine(send.mock.calls as unknown[][], [t1.email, t3.email, t4.email])).toEqual([]);
    expect((await admin.from("subscription_notices").select("kind").eq("trainer_id", t1.id)).data).toEqual([{ kind: "trial_ending" }]);
  });
  it("a different period end (a renewal happened) is a new notice", async () => {
    await setSub(t3.id, { current_period_end: new Date(Date.now() + 3 * DAY).toISOString() });
    const send = ok(); await runLifecycleEmails(admin, ENV, { sendEmailImpl: send as never });
    expect(mine(send.mock.calls as unknown[][], [t3.email])).toHaveLength(1);
  });
  it("a failed send is forgotten, so the next run tries again", async () => {
    const t = await mk("retry", "Reintento"); await setSub(t.id, { status: "trialing", trial_ends_at: new Date(Date.now() + 1 * DAY).toISOString() });
    const bad = vi.fn(async () => ({ ok: false })); const r1 = await runLifecycleEmails(admin, ENV, { sendEmailImpl: bad as never });
    expect(r1.failed).toBeGreaterThanOrEqual(1);
    expect((await admin.from("subscription_notices").select("kind").eq("trainer_id", t.id)).data).toEqual([]);
    const good = ok(); await runLifecycleEmails(admin, ENV, { sendEmailImpl: good as never });
    expect(mine(good.mock.calls as unknown[][], [t.email])).toHaveLength(1);
  });
  it("without the e-mail provider configured it does nothing and says so", async () => {
    const send = ok(); const r = await runLifecycleEmails(admin, {}, { sendEmailImpl: send as never });
    expect(r.skipped).toBe(true); expect(send).not.toHaveBeenCalled();
  });
  it("the notices table is closed to the browser roles", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    expect((await anon.from("subscription_notices").select("*")).error?.code).toBe("42501");
  });
});
