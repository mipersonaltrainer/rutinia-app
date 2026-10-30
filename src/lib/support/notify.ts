import type { SupabaseClient } from "@supabase/supabase-js";
import { emailConfig, sendEmail } from "@/lib/marketing/email";
import { pushConfig, sendPush, type PushConfig } from "@/lib/marketing/push";
import { categoryLabel } from "./schema";

// Support notifications that stay inside the platform's own channels: browser push and e-mail to the team when a trainer writes, and
// browser push to the trainer when the team answers. They carry who/what/where — never the text of the message. Nothing here may throw
// or slow the person who just wrote: callers run it after the response and ignore the outcome.
type Deps = { sendPushImpl?: typeof sendPush; sendEmailImpl?: typeof sendEmail; fetchImpl?: typeof fetch };
export type StaffNotice = { threadId: string; trainerName: string; category: string; subject: string; reply: boolean };

const clean = (s: string, n = 120) => s.replace(/[\r\n]+/g, " ").trim().slice(0, n);
const baseOf = (env: Record<string, string | undefined>) => (env.APPLICATION_BASE_URL ?? "").trim().replace(/\/+$/, "");

/** Pushes `payload` to every subscribed device of these users and forgets devices the browser says are gone. */
export async function pushToUsers(admin: SupabaseClient, cfg: PushConfig, userIds: string[], payload: { title: string; body: string; url: string; tag?: string }, send: typeof sendPush = sendPush) {
  if (userIds.length === 0) return { sent: 0, failed: 0, removed: 0 };
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint,p256dh,auth").in("user_id", userIds);
  let sent = 0, failed = 0, removed = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    const r = await send(cfg, { endpoint: s.endpoint as string, p256dh: s.p256dh as string, auth: s.auth as string }, payload);
    if (r.ok) sent++; else { failed++; if (r.gone) { await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint as string); removed++; } }
  }));
  return { sent, failed, removed };
}

/** A trainer wrote (new conversation, or the first unanswered message of one): push and e-mail to everyone on the team. */
export async function notifyStaffOfMessage(admin: SupabaseClient, t: StaffNotice, env: Record<string, string | undefined> = process.env, deps: Deps = {}) {
  const out = { push: { sent: 0, failed: 0, removed: 0 }, email: { sent: 0, failed: 0 } };
  try {
    const { data: team } = await admin.from("support_staff").select("user_id");
    const ids = (team ?? []).map((r) => r.user_id as string);
    if (ids.length === 0) return out;
    const path = `/staff/soporte/${t.threadId}`; const base = baseOf(env);
    const who = clean(t.trainerName, 60), what = categoryLabel(t.category), subject = clean(t.subject);
    const head = t.reply ? "Respuesta nueva de" : "Mensaje nuevo de";

    const pcfg = pushConfig(env);
    const pushing = pcfg ? pushToUsers(admin, pcfg, ids, { title: "Soporte: mensaje nuevo", body: `${who} · ${what}`, url: path, tag: `support-${t.threadId}` }, deps.sendPushImpl).then((r) => { out.push = r; }) : Promise.resolve();

    const ecfg = emailConfig(env);
    const mailing = ecfg ? (async () => {
      const send = deps.sendEmailImpl ?? sendEmail;
      await Promise.all(ids.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id); const to = data?.user?.email;
        if (!to) { out.email.failed++; return; }
        const r = await send(ecfg, { to, subject: `Rutinia · ${head.toLowerCase()} ${who} en soporte`, text: `${head} ${who}.\nTema: ${what}\nAsunto: «${subject}»`, link: path, footer: "Aviso interno del equipo de soporte de Rutinia. No incluye el texto del mensaje: ábrelo en el panel." }, base, deps.fetchImpl);
        if (r.ok) out.email.sent++; else out.email.failed++;
      }));
    })() : Promise.resolve();
    await Promise.allSettled([pushing, mailing]);
  } catch { /* support must keep working when a notification cannot be sent */ }
  return out;
}

/** The team answered: push to the trainer's subscribed devices (they chose to enable them). */
export async function notifyTrainerOfReply(admin: SupabaseClient, t: { trainerId: string; threadId: string }, env: Record<string, string | undefined> = process.env, deps: Deps = {}) {
  try {
    const cfg = pushConfig(env); if (!cfg) return { sent: 0, failed: 0, removed: 0 };
    return await pushToUsers(admin, cfg, [t.trainerId], { title: "Soporte te respondió", body: "Tienes una respuesta del equipo de Rutinia.", url: `/trainer/support/${t.threadId}`, tag: `support-${t.threadId}` }, deps.sendPushImpl);
  } catch { return { sent: 0, failed: 0, removed: 0 }; }
}
